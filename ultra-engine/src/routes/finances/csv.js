// Bank CSV import (5 NZ banks): POST /import-csv, GET /import-csv/profiles
const express = require('express');
const multer = require('multer');
const db = require('../../db');
const fx = require('../../fx');
const bankCsv = require('../../bank_csv');

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 }, storage: multer.memoryStorage() });

router.post('/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se envió archivo' });

    const csvText = req.file.buffer.toString('utf8');
    const requestedBank = (req.body.bank || 'auto').toLowerCase();
    const profileId = requestedBank === 'auto' ? null : requestedBank;

    const result = bankCsv.parseCsv(csvText, profileId);
    if (result.error || !result.rows) return res.status(400).json({ ok: false, error: result.error || 'Parse falló' });

    let inserted = 0, skipped = 0, failed = 0;
    for (const row of result.rows) {
      try {
        const amountNzd = await fx.convert(row.amount, 'NZD', 'NZD');
        const r = await db.queryOne(
          `INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source, fingerprint)
           VALUES ($1, $2, 'NZD', $3, 'csv_import', $4, $5, $6, 'csv', $7)
           ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL DO NOTHING RETURNING id`,
          [row.type, row.amount, amountNzd, row.description, row.date, row.account, row.fingerprint]);
        if (r) inserted++; else skipped++;
      } catch (err) { failed++; console.warn('CSV row failed:', err.message); }
    }

    res.json({
      ok: true, bank: result.profile, bank_name: result.name,
      total_rows: result.rows.length, inserted, skipped_duplicates: skipped, failed,
    });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/import-csv/profiles', (req, res) => {
  res.json({ ok: true, data: bankCsv.PROFILES });
});

module.exports = router;
