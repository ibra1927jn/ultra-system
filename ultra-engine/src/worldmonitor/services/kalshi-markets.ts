// ════════════════════════════════════════════════════════════
//  WM Phase 3 Bloque 4 Sub-b — Kalshi prediction markets
//
//  Kalshi (https://kalshi.com) is a CFTC-regulated US prediction
//  market exchange. Prices in USD, contracts settle 0–$1. Public
//  REST read endpoints, no auth needed for /events /markets /series.
//  No Cloudflare JA3 fingerprinting.
//
//  Strategy: hit /v2/events?status=open&with_nested_markets=true,
//  paginate via cursor, filter events by category WHITELIST
//  (drops Sports/Entertainment/Mentions noise), map each nested
//  market to PredictionMarketRow.
//
//  Used by ultra-engine/src/wm_bridge.js → runKalshiMarketsJob →
//  wm_prediction_markets + wm_prediction_market_snapshots.
//
//  Rate limit: Kalshi Basic tier 20 reads/s. We do ~10-30 paginated
//  /events calls per cron tick → comfortable.
// ════════════════════════════════════════════════════════════

import type { PredictionMarketRow, PredictionMarketOutcome } from './manifold-markets';

// ─── Kalshi raw response shapes (verified 2026-04-09) ───
interface KalshiMarket {
  ticker: string;
  event_ticker?: string;
  market_type?: string;          // 'binary' typically
  status?: string;               // 'active' for open
  open_time?: string;            // ISO
  close_time?: string;
  expiration_time?: string;
  yes_bid_dollars?: string;      // "0.0900"
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  previous_price_dollars?: string;
  volume_fp?: string;            // "71278.00"
  volume_24h_fp?: string;
  open_interest_fp?: string;
  liquidity_dollars?: string;
  notional_value_dollars?: string;
  result?: string;
  rules_primary?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  title?: string;
  sub_title?: string;
}

interface KalshiEvent {
  event_ticker: string;
  series_ticker?: string;
  category?: string;             // 'Politics', 'World', 'Economics', ...
  title?: string;
  sub_title?: string;
  mutually_exclusive?: boolean;
  markets?: KalshiMarket[];
}

interface KalshiEventsResponse {
  cursor?: string;
  events?: KalshiEvent[];
}

// ─── Category whitelist + normalization ───
// Maps Kalshi's `category` field on each event to our normalized
// category names. Categories not in this map are dropped (Sports,
// Entertainment, Mentions, Transportation, Social, Exotics, Education).
const KALSHI_CATEGORY_MAP: Record<string, string[]> = {
  'Politics':               ['politics'],
  'Elections':              ['elections'],
  'Economics':              ['macro'],
  'Financials':             ['macro'],
  'World':                  ['geopolitics'],
  'Climate and Weather':    ['science'],
  'Science and Technology': ['science', 'tech'],
  'Crypto':                 ['crypto'],
  'Health':                 ['biosec'],
  'Companies':              ['tech'],
};

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const PAGE_LIMIT = 200;          // Kalshi max
const FETCH_TIMEOUT_MS = 20_000;
const REQUEST_PAUSE_MS = 60;     // ~16 req/s under 20/s cap
const MAX_PAGES = 100;           // safety cap (200 × 100 = 20k events)

async function fetchEventsPage(cursor: string | undefined): Promise<KalshiEventsResponse | null> {
  const params = new URLSearchParams({
    status: 'open',
    with_nested_markets: 'true',
    limit: String(PAGE_LIMIT),
  });
  if (cursor) params.set('cursor', cursor);
  const url = `${KALSHI_BASE}/events?${params.toString()}`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) {
      console.warn(`[kalshi-markets] HTTP ${r.status}`);
      return null;
    }
    return (await r.json()) as KalshiEventsResponse;
  } catch (err) {
    console.warn(`[kalshi-markets] fetch:`, (err as Error).message);
    return null;
  }
}

function parseDollars(s: string | undefined | null): number | null {
  if (s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute canonical YES probability for a Kalshi market in [0,1].
 * Preference order:
 *   1. Midprice = (yes_bid + yes_ask) / 2 if both sides have a bid
 *   2. last_price_dollars if > 0
 *   3. yes_ask_dollars if > 0 (lower bound)
 *   4. null
 */
function computeProbability(m: KalshiMarket): number | null {
  const bid = parseDollars(m.yes_bid_dollars);
  const ask = parseDollars(m.yes_ask_dollars);
  if (bid !== null && ask !== null && bid > 0 && ask > 0 && ask >= bid) {
    return Number(((bid + ask) / 2).toFixed(6));
  }
  const last = parseDollars(m.last_price_dollars);
  if (last !== null && last > 0 && last <= 1) return Number(last.toFixed(6));
  if (ask !== null && ask > 0 && ask <= 1) return Number(ask.toFixed(6));
  return null;
}

function buildOutcomes(prob: number | null): PredictionMarketOutcome[] | null {
  if (prob === null) return null;
  return [
    { label: 'YES', probability: Number(prob.toFixed(6)) },
    { label: 'NO',  probability: Number((1 - prob).toFixed(6)) },
  ];
}

function isActive(m: KalshiMarket): boolean {
  if (m.status && m.status !== 'active') return false;
  const v24 = parseDollars(m.volume_24h_fp) ?? 0;
  const oi  = parseDollars(m.open_interest_fp) ?? 0;
  const liq = parseDollars(m.liquidity_dollars) ?? 0;
  return v24 > 0 || oi > 0 || liq > 0;
}

function buildQuestion(ev: KalshiEvent, m: KalshiMarket): string {
  const evTitle = (ev.title || '').trim();
  const evSub = (ev.sub_title || '').trim();
  const mSub = (m.yes_sub_title || m.sub_title || '').trim();

  // Multi-outcome event (e.g. "2028 President?" with one market per candidate):
  // append the per-market sub_title so each row is self-describing.
  if (ev.mutually_exclusive && mSub && mSub !== evTitle) {
    return `${evTitle} — ${mSub}`.slice(0, 1000);
  }
  // Otherwise event title (+ optional sub_title) is the canonical question.
  if (evSub && evSub !== evTitle) {
    return `${evTitle} — ${evSub}`.slice(0, 1000);
  }
  return evTitle.slice(0, 1000) || (m.title || m.ticker).slice(0, 1000);
}

/**
 * Fetch all open Kalshi events with nested markets, filter by category
 * whitelist + per-market activity, and map to PredictionMarketRow.
 */
export async function fetchAllKalshiMarkets(): Promise<PredictionMarketRow[]> {
  const out: PredictionMarketRow[] = [];
  let cursor: string | undefined;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const resp = await fetchEventsPage(cursor);
    pages++;
    if (!resp || !Array.isArray(resp.events) || resp.events.length === 0) break;

    for (const ev of resp.events) {
      const cat = ev.category || '';
      const normalized = KALSHI_CATEGORY_MAP[cat];
      if (!normalized) continue;                       // skip Sports/Entertainment/etc.
      const markets = Array.isArray(ev.markets) ? ev.markets : [];
      if (!markets.length) continue;

      const rawTags: string[] = [];
      if (cat) rawTags.push(cat);
      if (ev.series_ticker) rawTags.push(ev.series_ticker);

      for (const m of markets) {
        if (!m || !m.ticker) continue;
        if (!isActive(m)) continue;

        const probability = computeProbability(m);
        const outcomes = buildOutcomes(probability);
        const volume = parseDollars(m.volume_fp);
        const liquidity = parseDollars(m.liquidity_dollars);
        const openInterest = parseDollars(m.open_interest_fp);

        out.push({
          source: 'kalshi',
          sourceMarketId: m.ticker,
          sourceEventId: ev.event_ticker || m.event_ticker || null,
          slug: null,
          url: ev.event_ticker ? `https://kalshi.com/markets/${ev.event_ticker.toLowerCase()}` : null,
          question: buildQuestion(ev, m),
          description: m.rules_primary ? m.rules_primary.slice(0, 4000) : null,
          category: normalized.slice(),
          rawTags,
          marketType: 'binary',                        // Kalshi markets are individual binaries
          outcomes,
          probability,
          volume,
          liquidity,
          openInterest,
          currency: 'USD',
          traderCount: null,                           // Kalshi doesn't expose this
          openedAt: m.open_time || null,
          closesAt: m.close_time || null,
          resolvedAt: null,
          resolution: null,
          resolutionSource: null,
          status: 'open',
          // raw: just the market (not the whole event with all sibling markets)
          // to keep the row size sane
          raw: m,
        });
      }
    }

    cursor = resp.cursor;
    if (!cursor) break;
    await new Promise((res) => setTimeout(res, REQUEST_PAUSE_MS));
  }

  return out;
}
