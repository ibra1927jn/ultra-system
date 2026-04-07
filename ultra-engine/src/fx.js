// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — FX rates (P3)                            ║
// ║  Fuente primaria: Frankfurter (free, ECB, no auth)       ║
// ║  Fallback: fawazahmed0/exchange-api (free, unlimited)    ║
// ║  Cache: tabla fin_exchange_rates (UNIQUE date+base+quote)║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const FRANKFURTER = 'https://api.frankfurter.app';
// Monedas relevantes para usuario nómada dual ES/DZ con base NZD
const TRACKED_CURRENCIES = ['EUR', 'USD', 'GBP', 'AUD', 'JPY', 'CHF', 'CAD', 'THB', 'MXN', 'TRY'];
const BASE = 'NZD';

/**
 * Fetch rates últimos de Frankfurter para BASE → todas las TRACKED_CURRENCIES.
 * Idempotente: ON CONFLICT no inserta duplicados (UNIQUE date+base+quote).
 */
async function fetchLatest() {
  try {
    const symbols = TRACKED_CURRENCIES.join(',');
    const url = `${FRANKFURTER}/latest?from=${BASE}&to=${symbols}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'UltraSystem/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const data = await res.json();
    const date = data.date; // YYYY-MM-DD ECB date
    const rates = data.rates || {};

    let inserted = 0;
    for (const [quote, rate] of Object.entries(rates)) {
      const r = await db.queryOne(
        `INSERT INTO fin_exchange_rates (date, base, quote, rate, source)
         VALUES ($1, $2, $3, $4, 'frankfurter')
         ON CONFLICT (date, base, quote) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW()
         RETURNING id`,
        [date, BASE, quote, rate]
      );
      if (r) inserted++;
    }
    console.log(`💱 [FX] ${inserted} rates ${BASE}→${symbols} para ${date}`);
    return { date, count: inserted, rates };
  } catch (err) {
    console.error('❌ [FX] Frankfurter falló:', err.message);
    // Fallback a fawazahmed0/exchange-api
    return await fetchFallback();
  }
}

/**
 * Fallback: fawazahmed0/exchange-api (CDN-hosted JSON, free unlimited)
 * Docs: https://github.com/fawazahmed0/exchange-api
 */
async function fetchFallback() {
  try {
    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${BASE.toLowerCase()}.json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'UltraSystem/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`fawazahmed0 HTTP ${res.status}`);
    const data = await res.json();
    const date = data.date;
    const rates = data[BASE.toLowerCase()] || {};

    let inserted = 0;
    for (const quote of TRACKED_CURRENCIES) {
      const rate = rates[quote.toLowerCase()];
      if (!rate) continue;
      await db.query(
        `INSERT INTO fin_exchange_rates (date, base, quote, rate, source)
         VALUES ($1, $2, $3, $4, 'fawazahmed0')
         ON CONFLICT (date, base, quote) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW()`,
        [date, BASE, quote, rate]
      );
      inserted++;
    }
    console.log(`💱 [FX/fallback] ${inserted} rates de fawazahmed0 para ${date}`);
    return { date, count: inserted, rates };
  } catch (err) {
    console.error('❌ [FX/fallback] Falló:', err.message);
    return { date: null, count: 0, rates: {} };
  }
}

/**
 * Convierte amount de from→to usando el rate más reciente cacheado.
 * Si from==to retorna amount sin tocar.
 * Si la moneda no está cacheada y from===NZD, intenta lookup directo.
 * Si from!==NZD, hace doble conversión via NZD.
 */
async function convert(amount, from, to) {
  if (!amount || isNaN(amount)) return null;
  from = (from || 'NZD').toUpperCase();
  to = (to || 'NZD').toUpperCase();
  if (from === to) return parseFloat(amount);

  // Caso 1: NZD → X (lookup directo)
  if (from === 'NZD') {
    const r = await db.queryOne(
      `SELECT rate FROM fin_exchange_rates
       WHERE base='NZD' AND quote=$1
       ORDER BY date DESC LIMIT 1`,
      [to]
    );
    if (!r) return null;
    return parseFloat(amount) * parseFloat(r.rate);
  }
  // Caso 2: X → NZD (lookup invertido)
  if (to === 'NZD') {
    const r = await db.queryOne(
      `SELECT rate FROM fin_exchange_rates
       WHERE base='NZD' AND quote=$1
       ORDER BY date DESC LIMIT 1`,
      [from]
    );
    if (!r) return null;
    return parseFloat(amount) / parseFloat(r.rate);
  }
  // Caso 3: X → Y (via NZD)
  const fromNzd = await convert(amount, from, 'NZD');
  if (fromNzd === null) return null;
  return await convert(fromNzd, 'NZD', to);
}

/**
 * Lista los rates cacheados más recientes (para dashboard/Telegram).
 */
async function listLatestRates() {
  return db.queryAll(
    `SELECT DISTINCT ON (quote) quote, rate, date, source
     FROM fin_exchange_rates
     WHERE base = 'NZD'
     ORDER BY quote, date DESC`
  );
}

module.exports = {
  fetchLatest,
  convert,
  listLatestRates,
  TRACKED_CURRENCIES,
  BASE,
};
