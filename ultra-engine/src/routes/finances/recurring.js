// Recurring detection: POST /recurring/detect · GET /recurring · PATCH /:id/confirm
const express = require('express');
const db = require('../../db');
const recurring = require('../../recurring');

const router = express.Router();

router.post('/recurring/detect', async (req, res) => {
  try {
    const lookbackDays = parseInt(req.body?.lookback_days || '365', 10);
    const minSamples = parseInt(req.body?.min_samples || '3', 10);
    res.json(await recurring.detectRecurring({ lookbackDays, minSamples }));
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/recurring', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, payee_normalized, frequency, amount_avg, currency,
              next_expected, last_seen, confidence, sample_size, avg_interval_days,
              confirmed, (next_expected - CURRENT_DATE) AS days_until
       FROM fin_recurring WHERE confidence >= 0.5
       ORDER BY confidence DESC, amount_avg DESC`);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.patch('/recurring/:id/confirm', async (req, res) => {
  try {
    const row = await db.queryOne(
      `UPDATE fin_recurring SET confirmed=$1 WHERE id=$2 RETURNING *`,
      [req.body?.confirmed !== false, req.params.id]);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, data: row });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
