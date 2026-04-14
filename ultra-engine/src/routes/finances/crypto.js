// Crypto holdings + Binance sync + CoinGecko prices
const express = require('express');
const db = require('../../db');
const crypto = require('../../crypto');

const router = express.Router();

router.get('/crypto', async (req, res) => {
  try { res.json({ ok: true, ...(await crypto.getHoldings()) }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/crypto', async (req, res) => {
  try {
    const { symbol, amount, exchange, wallet_address, notes } = req.body;
    if (!symbol || amount === undefined || !exchange) {
      return res.status(400).json({ ok: false, error: 'symbol, amount, exchange obligatorios' });
    }
    const row = await db.queryOne(
      `INSERT INTO fin_crypto_holdings (symbol, amount, exchange, wallet_address, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (symbol, exchange) DO UPDATE SET
         amount=EXCLUDED.amount, wallet_address=EXCLUDED.wallet_address,
         notes=EXCLUDED.notes, updated_at=NOW()
       RETURNING *`,
      [symbol.toUpperCase(), amount, exchange, wallet_address || null, notes || null]);
    res.status(201).json({ ok: true, data: row });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.delete('/crypto/:id', async (req, res) => {
  try {
    const row = await db.queryOne('DELETE FROM fin_crypto_holdings WHERE id=$1 RETURNING id', [req.params.id]);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, deleted: row.id });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/crypto/sync-binance', async (req, res) => {
  try { res.json(await crypto.syncBinance()); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/crypto/prices', async (req, res) => {
  try {
    const symbols = (req.query.symbols || 'BTC,ETH,SOL').split(',');
    const vs = (req.query.vs || 'NZD').toUpperCase();
    res.json({ ok: true, vs, prices: await crypto.fetchPrices(symbols, vs) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
