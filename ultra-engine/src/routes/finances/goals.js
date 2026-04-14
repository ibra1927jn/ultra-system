// Savings goals CRUD: GET · POST · PATCH /:id · DELETE /:id
const express = require('express');
const db = require('../../db');

const router = express.Router();

router.get('/savings-goals', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, name, target_amount, current_amount, currency, target_date,
              category, is_active, notes,
              CASE WHEN target_amount > 0
                   THEN ROUND((current_amount / target_amount * 100)::numeric, 1)
                   ELSE 0 END AS progress_pct,
              CASE WHEN target_date IS NULL THEN NULL
                   ELSE (target_date - CURRENT_DATE) END AS days_remaining
       FROM fin_savings_goals WHERE is_active = TRUE
       ORDER BY target_date ASC NULLS LAST`);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/savings-goals', async (req, res) => {
  try {
    const { name, target_amount, current_amount, currency, target_date, category, notes } = req.body;
    if (!name || !target_amount) return res.status(400).json({ ok: false, error: 'name y target_amount obligatorios' });
    const row = await db.queryOne(
      `INSERT INTO fin_savings_goals (name, target_amount, current_amount, currency, target_date, category, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, target_amount, current_amount || 0, currency || 'NZD', target_date || null, category || null, notes || null]);
    res.status(201).json({ ok: true, data: row });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.patch('/savings-goals/:id', async (req, res) => {
  try {
    const { current_amount, target_amount, target_date, is_active, notes } = req.body;
    const row = await db.queryOne(
      `UPDATE fin_savings_goals SET
         current_amount = COALESCE($1, current_amount),
         target_amount  = COALESCE($2, target_amount),
         target_date    = COALESCE($3, target_date),
         is_active      = COALESCE($4, is_active),
         notes          = COALESCE($5, notes),
         updated_at     = NOW()
       WHERE id=$6 RETURNING *`,
      [current_amount, target_amount, target_date, is_active, notes, req.params.id]);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, data: row });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.delete('/savings-goals/:id', async (req, res) => {
  try {
    const row = await db.queryOne('DELETE FROM fin_savings_goals WHERE id=$1 RETURNING id', [req.params.id]);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, deleted: row.id });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
