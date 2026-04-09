// ════════════════════════════════════════════════════════════
//  WM Phase 3 Bloque 4 Sub-d — Polymarket prediction markets
//
//  Polymarket (https://polymarket.com) is a USDC-settled on-chain
//  prediction market on Polygon. The Gamma API
//  (https://gamma-api.polymarket.com) is a public off-chain index
//  with no auth required.
//
//  Historical note: an older code path in
//  src/worldmonitor/domains/prediction/v1/list-prediction-markets.ts
//  documented that Gamma was behind Cloudflare JA3 fingerprinting
//  and graceful-empty'd on every request. Verified 2026-04-09 from
//  this Hetzner box: Gamma now returns 200 to plain Node fetch
//  (markets, events, CLOB all open). The JA3 block is no longer
//  current and we can ingest for real.
//
//  Strategy: hit /events?closed=false&order=volume&ascending=false,
//  paginate via offset, decompose each event into its nested binary
//  markets, filter by category whitelist on event.tags + per-market
//  activity, map to PredictionMarketRow.
//
//  Used by ultra-engine/src/wm_bridge.js → runPolymarketMarketsJob →
//  wm_prediction_markets + wm_prediction_market_snapshots.
// ════════════════════════════════════════════════════════════

import type { PredictionMarketRow, PredictionMarketOutcome } from './manifold-markets';

// ─── Polymarket Gamma raw response shapes (verified 2026-04-09) ───
interface PolymarketGammaTag {
  id?: string;
  label?: string;
  slug?: string;
}

interface PolymarketGammaMarket {
  id: string;
  question: string;
  conditionId?: string;
  slug?: string;
  description?: string;
  outcomes?: string;          // JSON-stringified ["Yes","No"]
  outcomePrices?: string;     // JSON-stringified ["0.42","0.58"]
  volume?: string;
  volumeNum?: number;
  volume24hr?: number;
  liquidity?: string;
  liquidityNum?: number;
  closed?: boolean;
  active?: boolean;
  startDateIso?: string;
  endDateIso?: string;
  startDate?: string;
  endDate?: string;
  resolutionSource?: string;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
}

interface PolymarketGammaEvent {
  id: string;
  slug?: string;
  title?: string;
  description?: string;
  closed?: boolean;
  active?: boolean;
  volume?: number;
  liquidity?: number;
  tags?: PolymarketGammaTag[];
  markets?: PolymarketGammaMarket[];
  negRisk?: boolean;
}

// ─── Category whitelist + normalization ───
// Maps Polymarket Gamma `event.tags[].label` to our normalized
// category names. Tags not in this map are ignored. An event whose
// tags produce an empty normalized set is skipped entirely (drops
// Sports/Culture/NBA/Soccer/Games and the operational tags like
// "Earn 4%"/"Hide From New"/"Pre-Market").
const POLYMARKET_TAG_MAP: Record<string, string[]> = {
  // Politics & elections
  'Politics':         ['politics'],
  'Trump':            ['politics'],
  'Elections':        ['elections'],
  'Global Elections': ['elections'],
  'World Elections':  ['elections'],
  'US Election':      ['elections'],

  // Geopolitics & conflict
  'World':            ['geopolitics'],
  'Geopolitics':      ['geopolitics'],
  'Foreign Policy':   ['geopolitics'],
  'Middle East':      ['geopolitics'],
  'Ukraine':          ['geopolitics'],
  'Israel':           ['geopolitics'],
  'Iran':             ['geopolitics'],
  'Russia':           ['geopolitics'],
  'China':            ['geopolitics'],
  'Taiwan':           ['geopolitics'],
  'Venezuela':        ['geopolitics'],
  'NATO':             ['geopolitics'],

  // Macro & finance
  'Economy':          ['macro'],
  'Finance':          ['macro'],
  'Business':         ['macro'],
  'Jerome Powell':    ['macro'],
  'Fed':              ['macro'],
  'Inflation':        ['macro'],

  // Crypto
  'Crypto':           ['crypto'],
  'Crypto Prices':    ['crypto'],
  'Bitcoin':          ['crypto'],
  'Ethereum':         ['crypto'],

  // Tech & AI
  'Tech':             ['tech'],
  'Big Tech':         ['tech'],
  'AI':               ['ai'],
  'OpenAI':           ['ai'],

  // Science / health
  'Science':          ['science'],
  'Climate':          ['science'],
  'Health':           ['biosec'],
};

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const PAGE_LIMIT = 200;             // Gamma accepts up to 200
const MAX_PAGES = 10;               // top 2000 events by volume — matches Kalshi scale
const FETCH_TIMEOUT_MS = 20_000;
const REQUEST_PAUSE_MS = 150;       // be polite — Gamma is unmetered but unguaranteed

async function fetchEventsPage(offset: number): Promise<PolymarketGammaEvent[] | null> {
  const params = new URLSearchParams({
    closed: 'false',
    order: 'volume',
    ascending: 'false',
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  });
  const url = `${GAMMA_BASE}/events?${params.toString()}`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) {
      console.warn(`[polymarket-markets] HTTP ${r.status} at offset=${offset}`);
      return null;
    }
    const j = (await r.json()) as unknown;
    if (!Array.isArray(j)) {
      console.warn(`[polymarket-markets] non-array payload at offset=${offset}`);
      return null;
    }
    return j as PolymarketGammaEvent[];
  } catch (err) {
    console.warn(`[polymarket-markets] fetch offset=${offset}:`, (err as Error).message);
    return null;
  }
}

/**
 * Compute canonical YES probability for a Polymarket binary market in [0,1].
 * Preference order:
 *   1. outcomePrices[0] (the live indexed YES price from Gamma)
 *   2. midprice = (bestBid + bestAsk) / 2 if both > 0 and ask >= bid
 *   3. lastTradePrice if > 0
 *   4. null
 */
function computeProbability(m: PolymarketGammaMarket): number | null {
  const op = m.outcomePrices;
  if (op) {
    try {
      const arr: unknown = JSON.parse(op);
      if (Array.isArray(arr) && arr.length >= 1) {
        const yes = Number(arr[0]);
        if (Number.isFinite(yes) && yes >= 0 && yes <= 1) {
          return Number(yes.toFixed(6));
        }
      }
    } catch {
      /* fall through */
    }
  }
  const bid = typeof m.bestBid === 'number' ? m.bestBid : null;
  const ask = typeof m.bestAsk === 'number' ? m.bestAsk : null;
  if (bid !== null && ask !== null && bid > 0 && ask > 0 && ask >= bid && ask <= 1) {
    return Number(((bid + ask) / 2).toFixed(6));
  }
  const last = typeof m.lastTradePrice === 'number' ? m.lastTradePrice : null;
  if (last !== null && last > 0 && last <= 1) return Number(last.toFixed(6));
  return null;
}

function buildOutcomes(prob: number | null): PredictionMarketOutcome[] | null {
  if (prob === null) return null;
  return [
    { label: 'YES', probability: Number(prob.toFixed(6)) },
    { label: 'NO',  probability: Number((1 - prob).toFixed(6)) },
  ];
}

/**
 * A market counts as active if it has open trading interest. We require
 * non-zero 24h volume OR meaningful resting liquidity. Drops the long
 * tail of zombie markets that never trade.
 */
function isActive(m: PolymarketGammaMarket): boolean {
  if (m.closed) return false;
  if (m.active === false) return false;
  const v24 = typeof m.volume24hr === 'number' ? m.volume24hr : 0;
  const liq = typeof m.liquidityNum === 'number' ? m.liquidityNum : 0;
  return v24 > 0 || liq > 1000;
}

/**
 * Normalize an event's tags to our category vocabulary. Returns the
 * unique normalized set + the source-native tag labels for `raw_tags`.
 * If the normalized set is empty, the event is dropped upstream.
 */
function normalizeEventTags(ev: PolymarketGammaEvent): { normalized: string[]; raw: string[] } {
  const raw: string[] = [];
  const normSet = new Set<string>();
  for (const t of ev.tags || []) {
    const lbl = t.label;
    if (!lbl) continue;
    raw.push(lbl);
    const mapped = POLYMARKET_TAG_MAP[lbl];
    if (mapped) {
      for (const c of mapped) normSet.add(c);
    }
  }
  return { normalized: Array.from(normSet).sort(), raw };
}

function isoOrNull(s: string | undefined | null): string | null {
  if (!s) return null;
  // Gamma already returns ISO 8601 strings; just sanity-clamp.
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Fetch all open Polymarket events (top N by volume), filter by event
 * tag whitelist + per-market activity, map each nested binary market
 * to PredictionMarketRow.
 */
export async function fetchAllPolymarketMarkets(): Promise<PredictionMarketRow[]> {
  const out: PredictionMarketRow[] = [];
  const seenMarketIds = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const events = await fetchEventsPage(page * PAGE_LIMIT);
    if (!events || events.length === 0) break;

    for (const ev of events) {
      if (ev.closed) continue;
      const { normalized, raw } = normalizeEventTags(ev);
      if (normalized.length === 0) continue;     // drops sports/entertainment/ops

      const markets = Array.isArray(ev.markets) ? ev.markets : [];
      if (markets.length === 0) continue;

      const eventUrl = ev.slug ? `https://polymarket.com/event/${ev.slug}` : null;

      for (const m of markets) {
        if (!m || !m.id) continue;
        if (seenMarketIds.has(m.id)) continue;   // dedupe in case events overlap
        if (!isActive(m)) continue;

        const probability = computeProbability(m);
        const outcomes = buildOutcomes(probability);
        const volume =
          typeof m.volumeNum === 'number' && Number.isFinite(m.volumeNum)
            ? m.volumeNum
            : (m.volume ? Number(m.volume) : null);
        const liquidity =
          typeof m.liquidityNum === 'number' && Number.isFinite(m.liquidityNum)
            ? m.liquidityNum
            : (m.liquidity ? Number(m.liquidity) : null);

        seenMarketIds.add(m.id);
        out.push({
          source: 'polymarket',
          sourceMarketId: String(m.id),
          sourceEventId: ev.id ? String(ev.id) : null,
          slug: m.slug || null,
          url: eventUrl,
          question: m.question || (ev.title || '').slice(0, 1000),
          description: m.description ? m.description.slice(0, 4000) : null,
          category: normalized.slice(),
          rawTags: raw,
          marketType: 'binary',
          outcomes,
          probability,
          volume: Number.isFinite(volume as number) ? (volume as number) : null,
          liquidity: Number.isFinite(liquidity as number) ? (liquidity as number) : null,
          openInterest: null,                    // Gamma exposes this only at event level
          currency: 'USD',
          traderCount: null,                     // not exposed per-market
          openedAt: isoOrNull(m.startDateIso || m.startDate),
          closesAt: isoOrNull(m.endDateIso || m.endDate),
          resolvedAt: null,
          resolution: null,
          resolutionSource: m.resolutionSource ? m.resolutionSource.slice(0, 500) : null,
          status: 'open',
          raw: m,
        });
      }
    }

    if (events.length < PAGE_LIMIT) break;       // last partial page
    await new Promise((res) => setTimeout(res, REQUEST_PAUSE_MS));
  }

  return out;
}
