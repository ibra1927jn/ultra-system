// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Investments tracking (P3 Fase 3b)        ║
// ║                                                            ║
// ║  Stooq.com free CSV API para precios stocks/ETFs/indices.  ║
// ║  https://stooq.com (no auth, no rate limits razonables)    ║
// ║                                                            ║
// ║  Symbols: usar formato Stooq                               ║
// ║   - US stocks: AAPL.US, MSFT.US                            ║
// ║   - ETFs: SPY.US, VOO.US, VWCE.DE                          ║
// ║   - Indices: ^SPX, ^DJI, ^IXIC                             ║
// ║   - EU stocks: SAP.DE, ASML.AS                             ║
// ║                                                            ║
// ║  Persiste a fin_investments + reusa fin_exchange_rates     ║
// ║  para conversión a NZD.                                    ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const STOOQ_BASE = 'https://stooq.com/q/l/';

/**
 * Lookup price for a Stooq symbol. Returns { close, currency, date }.
 */
async function getQuote(symbol) {
  const url = `${STOOQ_BASE}?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Stooq HTTP ${r.status}`);
  const text = await r.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('Stooq empty');
  const headers = lines[0].toLowerCase().split(',');
  const values = lines[1].split(',');
  const row = Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim()]));
  if (!row.close || row.close === 'N/D') {
    return { symbol, error: 'no data' };
  }
  // Inferir currency por extensión del símbolo
  const ext = (symbol.split('.')[1] || '').toUpperCase();
  const currency = { US: 'USD', DE: 'EUR', AS: 'EUR', PA: 'EUR', UK: 'GBP', L: 'GBP', JP: 'JPY' }[ext] || 'USD';
  return {
    symbol,
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseInt(row.volume, 10),
    date: row.date,
    currency,
  };
}

/**
 * Fetch quotes for many symbols in parallel (with throttle).
 */
async function getQuotes(symbols) {
  const out = {};
  for (const sym of symbols) {
    try { out[sym] = await getQuote(sym); }
    catch (e) { out[sym] = { symbol: sym, error: e.message }; }
    await new Promise(r => setTimeout(r, 250));  // throttle suave
  }
  return out;
}

async function fxToNzd(amount, fromCurrency) {
  if (!amount) return 0;
  if (fromCurrency === 'NZD') return parseFloat(amount);
  // Try direct
  let r = await db.queryOne(
    `SELECT rate FROM fin_exchange_rates
     WHERE base = $1 AND quote='NZD' ORDER BY date DESC LIMIT 1`,
    [fromCurrency]
  );
  if (r) return parseFloat(amount) * parseFloat(r.rate);
  // Try inverse
  r = await db.queryOne(
    `SELECT rate FROM fin_exchange_rates
     WHERE base='NZD' AND quote=$1 ORDER BY date DESC LIMIT 1`,
    [fromCurrency]
  );
  if (r) return parseFloat(amount) / parseFloat(r.rate);
  // Fallback rough
  const fallback = { USD: 1.75, EUR: 2.0, GBP: 2.3, JPY: 0.011 };
  return parseFloat(amount) * (fallback[fromCurrency] || 1);
}

/**
 * Lee fin_investments + computa valuation actual + return %.
 */
async function getPortfolio() {
  const positions = await db.queryAll(
    `SELECT id, symbol, quantity, avg_cost, currency, account, notes, opened_at
     FROM fin_investments WHERE is_active = TRUE`
  );
  if (!positions.length) return { positions: [], total_nzd: 0, total_cost_nzd: 0, return_pct: 0 };

  const symbols = [...new Set(positions.map(p => p.symbol))];
  const quotes = await getQuotes(symbols);

  let totalValueNzd = 0;
  let totalCostNzd = 0;
  const enriched = [];

  for (const p of positions) {
    const q = quotes[p.symbol] || {};
    const close = q.close || 0;
    const currency = q.currency || p.currency;
    const valueNative = parseFloat(p.quantity) * close;
    const costNative = parseFloat(p.quantity) * parseFloat(p.avg_cost || 0);
    const valueNzd = await fxToNzd(valueNative, currency);
    const costNzd = await fxToNzd(costNative, currency);
    const pnlNzd = valueNzd - costNzd;
    const pnlPct = costNzd > 0 ? ((valueNzd - costNzd) / costNzd) * 100 : 0;
    totalValueNzd += valueNzd;
    totalCostNzd += costNzd;
    enriched.push({
      id: p.id,
      symbol: p.symbol,
      quantity: parseFloat(p.quantity),
      avg_cost: parseFloat(p.avg_cost),
      currency,
      current_price: close,
      value_native: Number(valueNative.toFixed(2)),
      value_nzd: Number(valueNzd.toFixed(2)),
      cost_nzd: Number(costNzd.toFixed(2)),
      pnl_nzd: Number(pnlNzd.toFixed(2)),
      pnl_pct: Number(pnlPct.toFixed(2)),
      account: p.account,
      quote_date: q.date,
    });
  }

  enriched.sort((a, b) => b.value_nzd - a.value_nzd);
  return {
    positions: enriched,
    total_value_nzd: Number(totalValueNzd.toFixed(2)),
    total_cost_nzd: Number(totalCostNzd.toFixed(2)),
    total_pnl_nzd: Number((totalValueNzd - totalCostNzd).toFixed(2)),
    return_pct: totalCostNzd > 0 ? Number((((totalValueNzd - totalCostNzd) / totalCostNzd) * 100).toFixed(2)) : 0,
  };
}

/**
 * Historical OHLCV from Stooq daily CSV.
 * Returns array of {date, open, high, low, close, volume}.
 *   d1: daily, d2: weekly, d3: monthly. interval default daily.
 *   from/to format: YYYYMMDD
 */
async function getHistory(symbol, { from, to, interval = 'd' } = {}) {
  const params = new URLSearchParams({ s: symbol.toLowerCase(), i: interval });
  if (from) params.set('d1', from);
  if (to) params.set('d2', to);
  const url = `https://stooq.com/q/d/l/?${params}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Stooq history HTTP ${r.status}`);
  const text = await r.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].toLowerCase().split(',');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(',');
    const row = Object.fromEntries(headers.map((h, idx) => [h.trim(), v[idx]?.trim()]));
    if (row.date && row.close && row.close !== 'N/D') {
      out.push({
        date: row.date,
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseInt(row.volume || '0', 10),
      });
    }
  }
  return out;
}

/**
 * Persiste históricos a fin_investment_history (idempotente por symbol+date).
 */
async function syncHistory(symbol, days = 365) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS fin_investment_history (
       id SERIAL PRIMARY KEY,
       symbol TEXT NOT NULL,
       date DATE NOT NULL,
       open NUMERIC(18,4),
       high NUMERIC(18,4),
       low NUMERIC(18,4),
       close NUMERIC(18,4),
       volume BIGINT,
       UNIQUE(symbol, date)
     )`
  );
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await getHistory(symbol, { from: fmt(from), to: fmt(to) });
  let inserted = 0;
  for (const r of rows) {
    const res = await db.queryOne(
      `INSERT INTO fin_investment_history (symbol, date, open, high, low, close, volume)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (symbol, date) DO NOTHING RETURNING id`,
      [symbol.toUpperCase(), r.date, r.open, r.high, r.low, r.close, r.volume]
    );
    if (res) inserted++;
  }
  return { symbol, fetched: rows.length, inserted };
}

module.exports = { getQuote, getQuotes, getPortfolio, fxToNzd, getHistory, syncHistory };
