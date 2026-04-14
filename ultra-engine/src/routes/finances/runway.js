// Runway with NW snapshot + by-account breakdown (multi-currency aware).
const express = require('express');
const db = require('../../db');
const wise = require('../../wise');
const bridges = require('../../bridges');

const router = express.Router();

router.get('/runway', async (req, res) => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const income = parseFloat((await db.queryOne(
      `SELECT COALESCE(SUM(amount_nzd), SUM(amount)) AS total FROM finances
       WHERE type='income' AND TO_CHAR(date,'YYYY-MM')=$1`, [month])).total || 0);
    const expense = parseFloat((await db.queryOne(
      `SELECT COALESCE(SUM(amount_nzd), SUM(amount)) AS total FROM finances
       WHERE type='expense' AND TO_CHAR(date,'YYYY-MM')=$1`, [month])).total || 0);

    const burn90 = parseFloat((await db.queryOne(
      `SELECT COALESCE(SUM(amount_nzd), SUM(amount))/90.0 AS daily FROM finances
       WHERE type='expense' AND date >= CURRENT_DATE - 90`)).daily || 0);

    const remaining = income - expense;
    const dayOfMonth = new Date().getDate();
    const burnMonth = dayOfMonth > 0 ? expense / dayOfMonth : 0;
    const runwayMonth = burnMonth > 0 ? Math.floor(remaining / burnMonth) : 999;
    const runway90 = burn90 > 0 ? Math.floor(remaining / burn90) : 999;

    const nw = await db.queryOne(
      `SELECT date, total_nzd, breakdown FROM fin_net_worth_snapshots ORDER BY date DESC LIMIT 1`);

    const byAccount = await db.queryAll(
      `SELECT COALESCE(account, 'manual') AS account, COALESCE(currency, 'NZD') AS currency,
         SUM(CASE WHEN type='income' THEN amount_nzd ELSE 0 END) AS in_nzd,
         SUM(CASE WHEN type='expense' THEN amount_nzd ELSE 0 END) AS out_nzd,
         COUNT(*) AS txns
       FROM finances WHERE TO_CHAR(date,'YYYY-MM') = $1
       GROUP BY account, currency
       ORDER BY (SUM(CASE WHEN type='income' THEN amount_nzd ELSE 0 END)
               - SUM(CASE WHEN type='expense' THEN amount_nzd ELSE 0 END)) DESC`,
      [month]);

    res.json({
      ok: true,
      data: {
        month, income_nzd: income, expense_nzd: expense, remaining_nzd: remaining,
        burn_rate_month: Math.round(burnMonth * 100) / 100,
        burn_rate_90d: Math.round(burn90 * 100) / 100,
        runway_days_month: runwayMonth, runway_days_90d: runway90,
        net_worth_snapshot: nw, by_account: byAccount,
        wise_configured: wise.isConfigured(),
      },
    });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/runway-status', async (req, res) => {
  try {
    const status = await bridges.getCurrentRunway();
    if (!status) return res.json({ ok: true, status: null, message: 'Sin snapshots NW o burn rate=0' });
    res.json({ ok: true, status });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
