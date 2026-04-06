// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Finanzas (P3)                       ║
// ║  CRUD ingresos/gastos + budget + runway + alertas        ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const { calculateRunway, BUDGET_ALERTS_SQL, INCOME_TOTAL_SQL, EXPENSE_TOTAL_SQL } = require('../utils/budget_calc');
const { toDateStr, currentMonth } = require('../utils/date_format');

const router = express.Router();

// ─── GET /api/finances ─ Listar movimientos ──────────────
router.get('/', async (req, res) => {
  try {
    const { type, category, limit } = req.query;
    let sql = 'SELECT * FROM finances WHERE 1=1';
    const params = [];

    // Filtro por tipo (income/expense)
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    // Filtro por categoria
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ' ORDER BY date DESC';
    params.push(parseInt(limit) || 50);
    sql += ` LIMIT $${params.length}`;

    const rows = await db.queryAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/summary ─ Resumen mensual ────────
router.get('/summary', async (req, res) => {
  try {
    const month = req.query.month || currentMonth();

    const [summary, byCategory] = await Promise.all([
      db.queryAll(
        `SELECT type,
         COUNT(*) as count,
         SUM(amount) as total,
         ARRAY_AGG(DISTINCT category) as categories
         FROM finances
         WHERE TO_CHAR(date, 'YYYY-MM') = $1
         GROUP BY type`,
        [month]
      ),
      db.queryAll(
        `SELECT category, type, SUM(amount) as total, COUNT(*) as count
         FROM finances
         WHERE TO_CHAR(date, 'YYYY-MM') = $1
         GROUP BY category, type
         ORDER BY total DESC`,
        [month]
      ),
    ]);

    const income = summary.find(r => r.type === 'income')?.total || 0;
    const expense = summary.find(r => r.type === 'expense')?.total || 0;

    res.json({
      ok: true,
      data: {
        month,
        income: parseFloat(income),
        expense: parseFloat(expense),
        balance: parseFloat(income) - parseFloat(expense),
        byCategory,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  BUDGET & RUNWAY — Presupuesto inteligente
// ═══════════════════════════════════════════════════════════

// ─── GET /api/finances/budget ─ Budget mensual + runway ──
router.get('/budget', async (req, res) => {
  try {
    const month = req.query.month || currentMonth();

    // Ingresos, gastos y categorias en paralelo
    const [income, expenses, byCategory] = await Promise.all([
      db.queryOne(INCOME_TOTAL_SQL, [month]),
      db.queryOne(EXPENSE_TOTAL_SQL, [month]),
      db.queryAll(
        `SELECT
           f.category,
           COALESCE(SUM(f.amount), 0) as spent,
           b.monthly_limit,
           CASE WHEN b.monthly_limit > 0
             THEN ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1)
             ELSE NULL
           END as percent_used
         FROM finances f
         LEFT JOIN budgets b ON LOWER(b.category) = LOWER(f.category)
         WHERE f.type = 'expense' AND TO_CHAR(f.date, 'YYYY-MM') = $1
         GROUP BY f.category, b.monthly_limit
         ORDER BY spent DESC`,
        [month]
      ),
    ]);

    const totalIncome = parseFloat(income.total);
    const totalExpense = parseFloat(expenses.total);

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const { remaining, dailyBurn, runway } = calculateRunway(totalIncome, totalExpense, dayOfMonth);

    res.json({
      ok: true,
      data: {
        month,
        income: totalIncome,
        expenses: totalExpense,
        remaining,
        daily_burn: Math.round(dailyBurn * 100) / 100,
        runway_days: runway,
        days_elapsed: dayOfMonth,
        days_in_month: daysInMonth,
        by_category: byCategory,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/finances/budget ─ Set limite por categoria ─
router.post('/budget', async (req, res) => {
  try {
    const { category, monthly_limit } = req.body;

    if (!category || monthly_limit == null) {
      return res.status(400).json({ ok: false, error: 'Faltan campos: category, monthly_limit' });
    }

    if (parseFloat(monthly_limit) <= 0) {
      return res.status(400).json({ ok: false, error: 'monthly_limit debe ser positivo' });
    }

    const result = await db.queryOne(
      `INSERT INTO budgets (category, monthly_limit)
       VALUES ($1, $2)
       ON CONFLICT (category) DO UPDATE SET monthly_limit = $2
       RETURNING *`,
      [category.toLowerCase().trim(), parseFloat(monthly_limit)]
    );

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/alerts ─ Categorias excediendo 80% ─
router.get('/alerts', async (req, res) => {
  try {
    const month = req.query.month || currentMonth();

    const alerts = await db.queryAll(BUDGET_ALERTS_SQL, [month]);

    res.json({
      ok: true,
      data: alerts,
      count: alerts.length,
      threshold: '80%',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/finances ─ Registrar movimiento ──────────
router.post('/', async (req, res) => {
  try {
    const { type, amount, category, description, date } = req.body;

    if (!type || !amount || !category) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: type, amount, category' });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'type debe ser income o expense' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ ok: false, error: 'amount debe ser un numero positivo' });
    }

    const result = await db.queryOne(
      `INSERT INTO finances (type, amount, category, description, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [type, parsedAmount, category, description || null, date || toDateStr()]
    );

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
