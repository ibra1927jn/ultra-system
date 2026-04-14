// Investments: portfolio, add, quote, performance ranges, TWR + Sharpe, history sync
const express = require('express');
const db = require('../../db');
const investments = require('../../investments');

const router = express.Router();

router.get('/investments', async (req, res) => {
  try { res.json({ ok: true, ...(await investments.getPortfolio()) }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/investments', async (req, res) => {
  try {
    const { symbol, quantity, avg_cost, currency, account, opened_at, notes } = req.body;
    if (!symbol || !quantity) return res.status(400).json({ ok: false, error: 'symbol y quantity obligatorios' });
    const row = await db.queryOne(
      `INSERT INTO fin_investments (symbol, quantity, avg_cost, currency, account, opened_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [symbol.toUpperCase(), quantity, avg_cost || null, currency || 'USD', account || null, opened_at || null, notes || null]);
    res.status(201).json({ ok: true, data: row });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/investments/quote/:symbol', async (req, res) => {
  try { res.json({ ok: true, data: await investments.getQuote(req.params.symbol) }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/investments/sync-history', async (req, res) => {
  try {
    const { symbol, days = 365 } = req.body || {};
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });
    res.json({ ok: true, data: await investments.syncHistory(symbol, parseInt(days, 10)) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/investments/performance', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol query param required' });
    res.json({ ok: true, data: await investments.getPerformanceRanges(symbol) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/investments/twr', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol query param required' });
    const rf = parseFloat(req.query.rf) || 0.04;
    res.json({ ok: true, data: await investments.getTwrAndSharpe(symbol, { riskFreeAnnual: rf }) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
