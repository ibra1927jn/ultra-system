// Budget endpoints: GET/POST /budget · GET /budget/carryover (envelope) · GET /alerts
const express = require('express');
const db = require('../../db');

const router = express.Router();

router.get('/budget', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const income = await db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total FROM finances
       WHERE type = 'income' AND TO_CHAR(date, 'YYYY-MM') = $1`, [month]);
    const expenses = await db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total FROM finances
       WHERE type = 'expense' AND TO_CHAR(date, 'YYYY-MM') = $1`, [month]);

    const byCategory = await db.queryAll(
      `SELECT f.category, COALESCE(SUM(f.amount), 0) as spent, b.monthly_limit,
         CASE WHEN b.monthly_limit > 0
           THEN ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1)
           ELSE NULL END as percent_used
       FROM finances f LEFT JOIN budgets b ON LOWER(b.category) = LOWER(f.category)
       WHERE f.type = 'expense' AND TO_CHAR(f.date, 'YYYY-MM') = $1
       GROUP BY f.category, b.monthly_limit ORDER BY spent DESC`, [month]);

    const totalIncome = parseFloat(income.total);
    const totalExpense = parseFloat(expenses.total);
    const remaining = totalIncome - totalExpense;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const dailyBurn = dayOfMonth > 0 ? totalExpense / dayOfMonth : 0;
    const runway = dailyBurn > 0 ? Math.floor(remaining / dailyBurn) : remaining > 0 ? 999 : 0;

    res.json({
      ok: true,
      data: {
        month, income: totalIncome, expenses: totalExpense, remaining,
        daily_burn: Math.round(dailyBurn * 100) / 100,
        runway_days: runway, days_elapsed: dayOfMonth, days_in_month: daysInMonth,
        by_category: byCategory,
      },
    });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/budget', async (req, res) => {
  try {
    const { category, monthly_limit } = req.body;
    if (!category || monthly_limit == null) return res.status(400).json({ ok: false, error: 'Faltan campos: category, monthly_limit' });
    if (parseFloat(monthly_limit) <= 0) return res.status(400).json({ ok: false, error: 'monthly_limit debe ser positivo' });

    const result = await db.queryOne(
      `INSERT INTO budgets (category, monthly_limit) VALUES ($1, $2)
       ON CONFLICT (category) DO UPDATE SET monthly_limit = $2 RETURNING *`,
      [category.toLowerCase().trim(), parseFloat(monthly_limit)]);
    res.status(201).json({ ok: true, data: result });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Envelope budgeting: unspent month delta accumulates into next month's effective_limit.
router.get('/budget/carryover', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const monthsBack = parseInt(req.query.monthsBack || '6', 10);
    const start = new Date(`${month}-01T00:00:00Z`);
    start.setUTCMonth(start.getUTCMonth() - monthsBack);
    const startStr = start.toISOString().slice(0, 7);

    const rows = await db.queryAll(
      `WITH months AS (
         SELECT TO_CHAR(generate_series($1::date, $2::date, INTERVAL '1 month'), 'YYYY-MM') AS m
       ),
       spend AS (
         SELECT TO_CHAR(date, 'YYYY-MM') AS m, LOWER(category) AS cat, SUM(amount) AS spent
         FROM finances
         WHERE type='expense' AND TO_CHAR(date,'YYYY-MM') BETWEEN TO_CHAR($1::date,'YYYY-MM') AND TO_CHAR($2::date,'YYYY-MM')
         GROUP BY 1,2
       )
       SELECT b.category, b.monthly_limit::numeric AS monthly_limit, m.m AS month,
         COALESCE(s.spent,0)::numeric AS spent,
         (b.monthly_limit - COALESCE(s.spent,0))::numeric AS delta
       FROM budgets b CROSS JOIN months m
       LEFT JOIN spend s ON s.m = m.m AND s.cat = LOWER(b.category)
       ORDER BY b.category, m.m`,
      [`${startStr}-01`, `${month}-01`]);

    const byCategory = {};
    for (const r of rows) {
      if (!byCategory[r.category]) {
        byCategory[r.category] = { category: r.category, monthly_limit: parseFloat(r.monthly_limit), carryover: 0, current_spent: 0, history: [] };
      }
      const c = byCategory[r.category];
      c.history.push({ month: r.month, spent: parseFloat(r.spent), delta: parseFloat(r.delta) });
      if (r.month === month) c.current_spent = parseFloat(r.spent);
      else c.carryover += parseFloat(r.delta);
    }
    const data = Object.values(byCategory).map(c => ({
      category: c.category, monthly_limit: c.monthly_limit,
      carryover_balance: Math.max(0, Math.round(c.carryover * 100) / 100),
      effective_limit: Math.round((c.monthly_limit + Math.max(0, c.carryover)) * 100) / 100,
      current_spent: c.current_spent,
      remaining: Math.round((c.monthly_limit + Math.max(0, c.carryover) - c.current_spent) * 100) / 100,
      history: c.history,
    }));
    res.json({ ok: true, month, monthsBack, data });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/alerts', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const alerts = await db.queryAll(
      `SELECT b.category, b.monthly_limit, COALESCE(SUM(f.amount), 0) as spent,
         ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1) as percent_used
       FROM budgets b
       LEFT JOIN finances f ON LOWER(f.category) = LOWER(b.category)
         AND f.type = 'expense' AND TO_CHAR(f.date, 'YYYY-MM') = $1
       GROUP BY b.category, b.monthly_limit
       HAVING COALESCE(SUM(f.amount), 0) >= b.monthly_limit * 0.8
       ORDER BY percent_used DESC`, [month]);
    res.json({ ok: true, data: alerts, count: alerts.length, threshold: '80%' });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
