// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Crypto holdings tracker (P3 Fase 2)      ║
// ║                                                            ║
// ║  CoinGecko API (free, no auth) para precios.              ║
// ║  https://api.coingecko.com/api/v3/simple/price            ║
// ║  Rate limit ~30 req/min en tier free → cache agresivo.    ║
// ║                                                            ║
// ║  Binance balances vía ccxt sólo si BINANCE_API_KEY+SECRET ║
// ║  están en env (read-only key obligatoria, sin withdraw).  ║
// ║  Sin claves → módulo stub.                                ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const CG_BASE = 'https://api.coingecko.com/api/v3';

// Mapping ticker → coingecko id (los más comunes para usuario)
const COIN_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  ADA: 'cardano', DOT: 'polkadot', MATIC: 'matic-network', AVAX: 'avalanche-2',
  XRP: 'ripple', DOGE: 'dogecoin', LTC: 'litecoin', LINK: 'chainlink',
  USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', BUSD: 'binance-usd',
  ATOM: 'cosmos', UNI: 'uniswap', NEAR: 'near', ALGO: 'algorand',
};

/**
 * Lookup precios CoinGecko en NZD para un set de symbols.
 * Cache en fin_exchange_rates con base=COIN, quote=NZD.
 */
async function fetchPrices(symbols, vs = 'NZD') {
  const upper = symbols.map(s => s.toUpperCase());
  const ids = upper.map(s => COIN_IDS[s]).filter(Boolean);
  if (!ids.length) return {};

  const url = `${CG_BASE}/simple/price?ids=${ids.join(',')}&vs_currencies=${vs.toLowerCase()}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) {
    throw new Error(`coingecko ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const data = await r.json();

  // Reverse map: coingecko_id → symbol
  const result = {};
  for (const sym of upper) {
    const id = COIN_IDS[sym];
    if (id && data[id]) {
      result[sym] = data[id][vs.toLowerCase()];
    }
  }

  // Cache prices in fin_exchange_rates (reuse FX cache table)
  const today = new Date().toISOString().split('T')[0];
  for (const [sym, price] of Object.entries(result)) {
    await db.query(
      `INSERT INTO fin_exchange_rates (date, base, quote, rate, source)
       VALUES ($1, $2, $3, $4, 'coingecko')
       ON CONFLICT (date, base, quote) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW()`,
      [today, sym, vs.toUpperCase(), price]
    );
  }

  return result;
}

/**
 * Lee fin_crypto_holdings, busca precios actuales, computa NZD value.
 */
async function getHoldings() {
  const rows = await db.queryAll(
    `SELECT id, symbol, amount, exchange, wallet_address, notes, updated_at
     FROM fin_crypto_holdings WHERE is_active = TRUE`
  );
  if (!rows.length) return { holdings: [], total_nzd: 0, prices: {} };

  const symbols = [...new Set(rows.map(r => r.symbol.toUpperCase()))];
  let prices = {};
  try {
    prices = await fetchPrices(symbols, 'NZD');
  } catch (err) {
    console.warn('coingecko fetch failed, using cached:', err.message);
    // Fall back to cached rates
    const cached = await db.queryAll(
      `SELECT base, rate FROM fin_exchange_rates
       WHERE base = ANY($1) AND quote='NZD' AND source='coingecko'
       ORDER BY date DESC LIMIT 100`,
      [symbols]
    );
    for (const c of cached) {
      if (!prices[c.base]) prices[c.base] = parseFloat(c.rate);
    }
  }

  let totalNzd = 0;
  const holdings = rows.map(r => {
    const sym = r.symbol.toUpperCase();
    const price = prices[sym] || 0;
    const valueNzd = parseFloat(r.amount) * price;
    totalNzd += valueNzd;
    return {
      id: r.id,
      symbol: sym,
      amount: parseFloat(r.amount),
      price_nzd: price,
      value_nzd: Number(valueNzd.toFixed(2)),
      exchange: r.exchange,
      wallet_address: r.wallet_address,
      notes: r.notes,
      updated_at: r.updated_at,
    };
  });

  holdings.sort((a, b) => b.value_nzd - a.value_nzd);
  return { holdings, total_nzd: Number(totalNzd.toFixed(2)), prices };
}

/**
 * Stub Binance ccxt — verifica si las keys están + intenta fetch balance.
 * Si ccxt no instalado o keys missing, devuelve {configured:false}.
 */
async function fetchBinanceBalances() {
  const binanceKey = process.env.BINANCE_API_KEY;
  const binanceSecret = process.env.BINANCE_API_SECRET;
  if (!binanceKey || !binanceSecret) {
    return { configured: false, reason: 'BINANCE_API_KEY/SECRET no configuradas' };
  }
  let ccxt;
  try {
    ccxt = require('ccxt');
  } catch {
    return { configured: false, reason: 'ccxt npm package no instalado (npm i ccxt para activar)' };
  }
  try {
    const ex = new ccxt.binance({ apiKey: binanceKey, secret: binanceSecret, options: { defaultType: 'spot' } });
    const balance = await ex.fetchBalance();
    const nonZero = Object.entries(balance.total || {})
      .filter(([_, v]) => v && v > 0)
      .map(([asset, total]) => ({ symbol: asset, amount: total }));
    return { configured: true, balances: nonZero };
  } catch (err) {
    return { configured: true, error: err.message };
  }
}

/**
 * Sync from Binance to fin_crypto_holdings (idempotente por symbol+exchange).
 */
async function syncBinance() {
  const result = await fetchBinanceBalances();
  if (!result.configured || result.error) return result;
  let upserted = 0;
  for (const b of result.balances) {
    if (b.amount < 0.0001) continue; // dust
    await db.query(
      `INSERT INTO fin_crypto_holdings (symbol, amount, exchange, is_active)
       VALUES ($1, $2, 'binance', TRUE)
       ON CONFLICT (symbol, exchange) DO UPDATE SET amount=EXCLUDED.amount, updated_at=NOW()`,
      [b.symbol.toUpperCase(), b.amount]
    );
    upserted++;
  }
  return { configured: true, upserted, total: result.balances.length };
}

module.exports = {
  COIN_IDS,
  fetchPrices,
  getHoldings,
  fetchBinanceBalances,
  syncBinance,
};
