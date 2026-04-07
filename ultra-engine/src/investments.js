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
 * Yahoo Finance v8 chart API — JSON, free, no auth.
 * Fallback usado por syncHistory cuando Stooq devuelve la página de gating.
 *   range: '1d','5d','1mo','3mo','6mo','1y','2y','5y','10y','ytd','max'
 *   interval: '1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'
 * Acepta símbolos con sufijo Stooq (.US/.DE/...): se mapea para Yahoo.
 * Devuelve [{date,open,high,low,close,volume}] con la misma forma que getHistory().
 */
async function getHistoryYahoo(symbol, { range = '1y', interval = '1d' } = {}) {
  // Stooq → Yahoo symbol mapping (best effort, sólo casos comunes)
  let yahooSym = symbol;
  const m = symbol.match(/^([^.]+)\.([A-Z]{1,3})$/i);
  if (m) {
    const root = m[1].toUpperCase();
    const ext = m[2].toUpperCase();
    const suffix = { US: '', DE: '.DE', AS: '.AS', PA: '.PA', UK: '.L', L: '.L', JP: '.T' }[ext];
    yahooSym = root + (suffix !== undefined ? suffix : '.' + ext);
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${interval}&range=${range}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const j = await r.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo: empty result');
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null || isNaN(close)) continue;
    out.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return out;
}

/**
 * Persiste históricos a fin_investment_history (idempotente por symbol+date).
 * 2026-04-07: Stooq gating su CSV download desde non-browser clients →
 * fallback automático a Yahoo Finance v8 chart API.
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

  let rows = [];
  let source = null;
  // Intento 1: Stooq (legacy)
  try {
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
    rows = await getHistory(symbol, { from: fmt(from), to: fmt(to) });
    if (rows.length > 0) source = 'stooq';
  } catch { /* ignore, try yahoo */ }

  // Fallback: Yahoo
  if (rows.length === 0) {
    const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : days <= 730 ? '2y' : '5y';
    try {
      rows = await getHistoryYahoo(symbol, { range });
      source = 'yahoo';
    } catch (e) {
      return { symbol, fetched: 0, inserted: 0, error: `both stooq+yahoo failed: ${e.message}` };
    }
  }

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
  return { symbol, source, fetched: rows.length, inserted };
}

// ════════════════════════════════════════════════════════════
//  Performance metrics (R4 Tier A 2026-04-07)
//  TWR (time-weighted return) + period ranges + Sharpe ratio.
//  Usa fin_investment_history (close prices) para calcular returns.
//  No depende de ningún broker — pure math sobre datos ya en DB.
// ════════════════════════════════════════════════════════════

/**
 * Stdev de un array de números (sample stdev, n-1).
 */
function _stdev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Returns periodicos para un símbolo.
 *   { period: { start_date, end_date, start_close, end_close, return_pct } }
 * Periodos: 1d, 1w, 1m, 3m, ytd, 1y, max
 */
async function getPerformanceRanges(symbol) {
  const sym = symbol.toUpperCase();
  let rows;
  try {
    rows = await db.queryAll(
      `SELECT date::text AS date, close::float AS close
       FROM fin_investment_history
       WHERE symbol = $1 AND close IS NOT NULL
       ORDER BY date ASC`,
      [sym]
    );
  } catch (err) {
    if (/relation .* does not exist/i.test(err.message)) {
      return { symbol: sym, error: 'fin_investment_history table missing — POST /api/finances/investments/sync-history first' };
    }
    throw err;
  }
  if (rows.length < 2) return { symbol: sym, error: 'insufficient history (run /investments/sync-history first)' };

  const last = rows[rows.length - 1];
  const lastDate = new Date(last.date);
  const lastClose = last.close;

  // Helper: encuentra la fila más cercana <= fecha objetivo
  const closestBefore = (target) => {
    let candidate = null;
    for (const r of rows) {
      if (new Date(r.date) <= target) candidate = r;
      else break;
    }
    return candidate;
  };

  const periods = {
    '1d':  new Date(lastDate.getTime() - 1   * 86400000),
    '1w':  new Date(lastDate.getTime() - 7   * 86400000),
    '1m':  new Date(lastDate.getTime() - 30  * 86400000),
    '3m':  new Date(lastDate.getTime() - 90  * 86400000),
    'ytd': new Date(lastDate.getFullYear(), 0, 1),
    '1y':  new Date(lastDate.getTime() - 365 * 86400000),
    'max': new Date(rows[0].date),
  };

  const out = { symbol: sym, last_date: last.date, last_close: lastClose, periods: {} };
  for (const [name, target] of Object.entries(periods)) {
    const start = closestBefore(target) || rows[0];
    const ret = start.close > 0 ? ((lastClose - start.close) / start.close) * 100 : 0;
    out.periods[name] = {
      start_date: start.date,
      start_close: start.close,
      return_pct: Number(ret.toFixed(2)),
    };
  }
  return out;
}

/**
 * Time-Weighted Return + Sharpe ratio para un símbolo.
 *   - dailyReturns = (close_t - close_{t-1}) / close_{t-1}
 *   - TWR cumulative = product(1 + r_i) - 1
 *   - Annualized vol = stdev(daily) * sqrt(252)
 *   - Annualized return = (1 + cumReturn)^(252/n) - 1
 *   - Sharpe = (annReturn - rf) / annVol  (rf default 0.04 = 4% NZD risk-free)
 */
async function getTwrAndSharpe(symbol, { riskFreeAnnual = 0.04 } = {}) {
  const sym = symbol.toUpperCase();
  let rows;
  try {
    rows = await db.queryAll(
      `SELECT close::float AS close FROM fin_investment_history
       WHERE symbol=$1 AND close IS NOT NULL ORDER BY date ASC`,
      [sym]
    );
  } catch (err) {
    if (/relation .* does not exist/i.test(err.message)) {
      return { symbol: sym, error: 'fin_investment_history table missing — POST /api/finances/investments/sync-history first' };
    }
    throw err;
  }
  if (rows.length < 30) return { symbol: sym, error: 'need >=30 daily closes for TWR/Sharpe' };

  const dailyReturns = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].close;
    if (prev > 0) dailyReturns.push((rows[i].close - prev) / prev);
  }

  let cum = 1;
  for (const r of dailyReturns) cum *= 1 + r;
  const cumReturn = cum - 1;

  const n = dailyReturns.length;
  const annReturn = Math.pow(1 + cumReturn, 252 / n) - 1;
  const dailyVol = _stdev(dailyReturns);
  const annVol = dailyVol * Math.sqrt(252);
  const sharpe = annVol > 0 ? (annReturn - riskFreeAnnual) / annVol : null;

  return {
    symbol: sym,
    samples: n,
    cumulative_return_pct: Number((cumReturn * 100).toFixed(2)),
    annualized_return_pct: Number((annReturn * 100).toFixed(2)),
    annualized_volatility_pct: Number((annVol * 100).toFixed(2)),
    sharpe_ratio: sharpe !== null ? Number(sharpe.toFixed(3)) : null,
    risk_free_rate_used: riskFreeAnnual,
  };
}

module.exports = {
  getQuote, getQuotes, getPortfolio, fxToNzd, getHistory, getHistoryYahoo, syncHistory,
  getPerformanceRanges, getTwrAndSharpe,
};
