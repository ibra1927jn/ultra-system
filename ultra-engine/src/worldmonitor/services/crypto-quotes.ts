// ════════════════════════════════════════════════════════════
//  WM Phase 3 — Crypto quotes (CoinGecko public API)
//
//  No auth, no key. Free tier: 10-30 req/min. We use 2 calls per cron run:
//   1) /coins/markets?ids=bitcoin,ethereum,solana,ripple — per-coin stats
//   2) /global — global market cap + BTC dominance
//
//  Used by ultra-engine/src/wm_bridge.js → runCryptoQuotesJob → wm_crypto_quotes.
//  Catalogo: ./worldmonitor/config/markets.ts CRYPTO_IDS / CRYPTO_MAP.
// ════════════════════════════════════════════════════════════

import { CRYPTO_IDS, CRYPTO_MAP } from '@/config/markets';

export interface CryptoQuote {
  coinId: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  change1hPct: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
  athUsd: number | null;
  athChangePct: number | null;
  circulatingSupply: number | null;
  // Same value across every quote in a single fetch — denormalized for
  // simpler downstream queries.
  globalMarketCapUsd: number | null;
  btcDominancePct: number | null;
  activeCryptocurrencies: number | null;
}

interface CoingeckoMarketRow {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap?: number;
  total_volume?: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_7d_in_currency?: number;
  ath?: number;
  ath_change_percentage?: number;
  circulating_supply?: number;
}

interface CoingeckoGlobalResponse {
  data?: {
    total_market_cap?: { usd?: number };
    market_cap_percentage?: { btc?: number };
    active_cryptocurrencies?: number;
  };
}

const CG_BASE = 'https://api.coingecko.com/api/v3';

async function fetchMarkets(): Promise<CoingeckoMarketRow[]> {
  const ids = CRYPTO_IDS.join(',');
  const url = `${CG_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`CoinGecko markets HTTP ${r.status}`);
  const j = (await r.json()) as CoingeckoMarketRow[];
  if (!Array.isArray(j)) throw new Error('CoinGecko markets: unexpected payload shape');
  return j;
}

async function fetchGlobal(): Promise<{
  globalMarketCapUsd: number | null;
  btcDominancePct: number | null;
  activeCryptocurrencies: number | null;
}> {
  const url = `${CG_BASE}/global`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) {
    console.warn(`[crypto-quotes] CoinGecko /global HTTP ${r.status} (continuing without globals)`);
    return { globalMarketCapUsd: null, btcDominancePct: null, activeCryptocurrencies: null };
  }
  const j = (await r.json()) as CoingeckoGlobalResponse;
  return {
    globalMarketCapUsd:
      typeof j?.data?.total_market_cap?.usd === 'number'
        ? Math.round(j.data.total_market_cap.usd)
        : null,
    btcDominancePct:
      typeof j?.data?.market_cap_percentage?.btc === 'number'
        ? Number(j.data.market_cap_percentage.btc.toFixed(4))
        : null,
    activeCryptocurrencies:
      typeof j?.data?.active_cryptocurrencies === 'number'
        ? j.data.active_cryptocurrencies
        : null,
  };
}

/**
 * Fetch all configured crypto quotes + global market state in one go.
 * Total: 2 HTTP calls. Resilient: if /global fails, returns coin rows
 * with global fields nulled.
 */
export async function fetchAllCryptoQuotes(): Promise<CryptoQuote[]> {
  const [markets, globals] = await Promise.all([fetchMarkets(), fetchGlobal()]);

  const out: CryptoQuote[] = [];
  for (const row of markets) {
    if (typeof row.current_price !== 'number') continue;
    const meta = CRYPTO_MAP[row.id] || { name: row.name, symbol: row.symbol.toUpperCase() };
    out.push({
      coinId: row.id,
      symbol: meta.symbol,
      name: meta.name,
      priceUsd: row.current_price,
      marketCapUsd: typeof row.market_cap === 'number' ? row.market_cap : null,
      volume24hUsd: typeof row.total_volume === 'number' ? row.total_volume : null,
      change1hPct:
        typeof row.price_change_percentage_1h_in_currency === 'number'
          ? Number(row.price_change_percentage_1h_in_currency.toFixed(4))
          : null,
      change24hPct:
        typeof row.price_change_percentage_24h === 'number'
          ? Number(row.price_change_percentage_24h.toFixed(4))
          : null,
      change7dPct:
        typeof row.price_change_percentage_7d_in_currency === 'number'
          ? Number(row.price_change_percentage_7d_in_currency.toFixed(4))
          : null,
      athUsd: typeof row.ath === 'number' ? row.ath : null,
      athChangePct:
        typeof row.ath_change_percentage === 'number'
          ? Number(row.ath_change_percentage.toFixed(4))
          : null,
      circulatingSupply:
        typeof row.circulating_supply === 'number' ? row.circulating_supply : null,
      globalMarketCapUsd: globals.globalMarketCapUsd,
      btcDominancePct: globals.btcDominancePct,
      activeCryptocurrencies: globals.activeCryptocurrencies,
    });
  }

  return out;
}
