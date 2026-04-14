// GET /nw-timeline?days=N — period trend + per-day snapshots.
const express = require('express');
const db = require('../../db');

const router = express.Router();

router.get('/nw-timeline', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '90', 10);
    const rows = await db.queryAll(
      `SELECT date, total_nzd, breakdown FROM fin_net_worth_snapshots
       WHERE date >= CURRENT_DATE - INTERVAL '${days} days' ORDER BY date ASC`);

    let trend = null;
    if (rows.length >= 2) {
      const first = parseFloat(rows[0].total_nzd);
      const last = parseFloat(rows[rows.length - 1].total_nzd);
      const delta = last - first;
      const pct = first !== 0 ? (delta / first * 100) : 0;
      const periodDays = (new Date(rows[rows.length - 1].date) - new Date(rows[0].date)) / 86400000;
      const dailyChange = periodDays > 0 ? delta / periodDays : 0;
      trend = {
        first_date: rows[0].date, last_date: rows[rows.length - 1].date,
        first_nzd: first, last_nzd: last,
        delta_nzd: Number(delta.toFixed(2)), delta_pct: Number(pct.toFixed(2)),
        avg_daily_change_nzd: Number(dailyChange.toFixed(2)),
        period_days: Math.round(periodDays),
      };
    }

    res.json({ ok: true, count: rows.length, trend, data: rows });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
