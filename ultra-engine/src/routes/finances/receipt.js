// POST /receipt — Tesseract OCR + parse merchant/amount/date/currency from receipt image/PDF.
// Reuses ocr.extractText from P4 (paperless flow).
const express = require('express');
const multer = require('multer');
const ocr = require('../../ocr');

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 }, storage: multer.memoryStorage() });

function parseReceiptText(text) {
  if (!text) return { merchant: null, amount: null, currency: null, date: null };
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const merchant = lines.find(l => l.length > 3 && l.length < 60 && !/^\d/.test(l) && /[a-z]/i.test(l)) || null;

  const currencyMatch = text.match(/\b(NZD|EUR|USD|GBP|AUD|CHF|JPY|CAD)\b/i)
    || text.match(/(€|£|\$|¥)/);
  const symbolMap = { '€': 'EUR', '£': 'GBP', '$': 'USD', '¥': 'JPY' };
  const currency = currencyMatch
    ? (symbolMap[currencyMatch[1]] || currencyMatch[1].toUpperCase())
    : null;

  let amount = null;
  for (const line of lines) {
    if (/total|amount|importe|a pagar|to pay|grand total|total due/i.test(line)) {
      const matches = line.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g);
      if (matches && matches.length) {
        const raw = matches[matches.length - 1].replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed > 0) { amount = parsed; break; }
      }
    }
  }
  if (amount === null) {
    const all = (text.match(/\b\d{1,4}[.,]\d{2}\b/g) || [])
      .map(s => parseFloat(s.replace(',', '.')))
      .filter(n => !isNaN(n) && n > 0);
    if (all.length) amount = Math.max(...all);
  }

  let date = null;
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
    || text.match(/\b(\d{2}[/.\-]\d{2}[/.\-]\d{4})\b/);
  if (dateMatch) {
    const raw = dateMatch[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) date = raw;
    else {
      const parts = raw.split(/[/.\-]/);
      // dd/mm/yyyy (ES/NZ/AU format) — never mm/dd
      date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  return { merchant: merchant ? merchant.slice(0, 100) : null, amount, currency, date };
}

router.post('/receipt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'file required (multipart/form-data)' });
    const filePath = ocr.saveFile(req.file.buffer, req.file.originalname);
    const { text, confidence, method } = await ocr.extractText(filePath);
    const parsed = parseReceiptText(text);

    const suggestion = {
      type: 'expense', amount: parsed.amount,
      currency: parsed.currency || 'NZD', category: null,
      description: parsed.merchant,
      date: parsed.date || new Date().toISOString().slice(0, 10),
      account: null,
    };

    res.json({
      ok: true,
      ocr: { confidence, method, text_length: text.length, raw_text: text.slice(0, 500) },
      parsed, suggested_row: suggestion,
      hint: 'POST suggested_row a /api/finances tras editar/confirmar en el front',
    });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router._parseReceiptText = parseReceiptText;
module.exports = router;
