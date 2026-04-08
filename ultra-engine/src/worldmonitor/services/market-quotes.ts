// ════════════════════════════════════════════════════════════
//  WM Phase 3 — Market quotes (Yahoo Finance v8 chart, snapshot mode)
//
//  Direct HTTP path. No auth, no key, no relay. Yahoo's v8 chart endpoint
//  returns a `meta` block per symbol with regularMarketPrice / previousClose
//  / dayHigh / dayLow / regularMarketVolume / currency / exchangeName /
//  marketState — exactly what we need for time-series snapshots without
//  parsing the full intraday OHLC array.
//
//  Used by ultra-engine/src/wm_bridge.js → runMarketQuotesJob → wm_market_quotes.
//  Catalogo: ./worldmonitor/config/markets.ts (~46 symbols).
// ════════════════════════════════════════════════════════════

import { SECTORS, COMMODITIES, MARKET_SYMBOLS } from '@/config/markets';

export type MarketCategory = 'sector' | 'commodity' | 'index' | 'stock';

export interface MarketQuote {
  symbol: string;
  display: string;
  name: string;
  category: MarketCategory;
  price: number;
  previousClose: number | null;
  changeAbs: number | null;
  changePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  currency: string | null;
  exchange: string | null;
  marketState: string | null;
}

interface MarketCatalogEntry {
  symbol: string;
  display: string;
  name: string;
  category: MarketCategory;
}

/**
 * Build the unified flat catalog from the typed market config. Indices
 * (^GSPC, ^DJI, ^IXIC, ^VIX) are detected by leading "^"; everything in
 * MARKET_SYMBOLS that's not an index is classified as 'stock'.
 */
export function buildMarketCatalog(): MarketCatalogEntry[] {
  const out: MarketCatalogEntry[] = [];

  for (const s of SECTORS) {
    out.push({ symbol: s.symbol, display: s.symbol, name: s.name, category: 'sector' });
  }
  for (const c of COMMODITIES) {
    out.push({
      symbol: c.symbol,
      display: c.display,
      name: c.name,
      // ^VIX is technically an index but lives in COMMODITIES in the
      // existing catalog — keep it tagged 'index' for clean queries.
      category: c.symbol.startsWith('^') ? 'index' : 'commodity',
    });
  }
  for (const m of MARKET_SYMBOLS) {
    out.push({
      symbol: m.symbol,
      display: m.display,
      name: m.name,
      category: m.symbol.startsWith('^') ? 'index' : 'stock',
    });
  }

  return out;
}

interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  currency?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  marketState?: string;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{ meta?: YahooChartMeta }> | null;
    error?: { code?: string; description?: string } | null;
  };
}

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/**
 * Fetch a single Yahoo v8 chart snapshot. Returns null on error or
 * missing price (caller decides whether to log/skip).
 */
export async function fetchYahooSnapshot(symbol: string): Promise<YahooChartMeta | null> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.warn(`[market-quotes] Yahoo HTTP ${r.status} for ${symbol}`);
      return null;
    }
    const j = (await r.json()) as YahooChartResponse;
    if (j?.chart?.error) {
      console.warn(`[market-quotes] Yahoo error for ${symbol}:`, j.chart.error.description);
      return null;
    }
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') return null;
    return meta;
  } catch (err) {
    console.warn(`[market-quotes] Yahoo fetch ${symbol}:`, (err as Error).message);
    return null;
  }
}

/**
 * Fetch quotes for the entire catalog. Bounded parallelism (chunks of 8)
 * with a 150ms gap between chunks to stay polite with Yahoo's public
 * endpoint. ~46 symbols → ~6 chunks → ~5-7s wall clock total.
 */
export async function fetchAllMarketQuotes(): Promise<MarketQuote[]> {
  const catalog = buildMarketCatalog();
  const out: MarketQuote[] = [];
  const CHUNK = 8;
  const GAP_MS = 150;

  for (let i = 0; i < catalog.length; i += CHUNK) {
    const chunk = catalog.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(
      chunk.map(async (entry) => {
        const meta = await fetchYahooSnapshot(entry.symbol);
        if (!meta) return null;

        const price = Number(meta.regularMarketPrice);
        const prev = Number(meta.previousClose ?? meta.chartPreviousClose ?? NaN);
        const changeAbs = Number.isFinite(prev) ? price - prev : null;
        const changePct =
          Number.isFinite(prev) && prev !== 0
            ? ((price - prev) / prev) * 100
            : null;

        const q: MarketQuote = {
          symbol: entry.symbol,
          display: entry.display,
          name: entry.name,
          category: entry.category,
          price,
          previousClose: Number.isFinite(prev) ? prev : null,
          changeAbs: changeAbs !== null ? Number(changeAbs.toFixed(4)) : null,
          changePct: changePct !== null ? Number(changePct.toFixed(4)) : null,
          dayHigh: Number.isFinite(meta.regularMarketDayHigh)
            ? Number(meta.regularMarketDayHigh)
            : null,
          dayLow: Number.isFinite(meta.regularMarketDayLow)
            ? Number(meta.regularMarketDayLow)
            : null,
          volume: Number.isFinite(meta.regularMarketVolume)
            ? Number(meta.regularMarketVolume)
            : null,
          currency: meta.currency || null,
          exchange: meta.fullExchangeName || meta.exchangeName || null,
          marketState: meta.marketState || null,
        };
        return q;
      })
    );

    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) out.push(s.value);
    }

    if (i + CHUNK < catalog.length) {
      await new Promise((res) => setTimeout(res, GAP_MS));
    }
  }

  return out;
}
