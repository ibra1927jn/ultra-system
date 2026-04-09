// ════════════════════════════════════════════════════════════
//  WM Phase 3 Bloque 4 Sub-a — Manifold Markets ingestion
//
//  Manifold Markets (https://manifold.markets) is a free, open-source
//  prediction-market platform with a public REST API. No auth, no
//  Cloudflare JA3 fingerprinting — clean Node.js fetch works.
//  Currency is MANA (their internal play-money token, not USD).
//
//  Strategy: hit /v0/search-markets?term={t}&limit=100 once per
//  search term, dedupe by id, merge categories from terms that
//  matched the same market, filter to active non-resolved markets
//  with real betting activity.
//
//  Used by ultra-engine/src/wm_bridge.js → runManifoldMarketsJob →
//  wm_prediction_markets + wm_prediction_market_snapshots.
//
//  Rate limit: Manifold caps at 500 req/min per IP. With 9 categories
//  × ~5 search terms = ~45 calls per cron tick (~5s wall clock at
//  ~100ms each). Comfortably under cap.
// ════════════════════════════════════════════════════════════

// ─── Generic prediction-market row (shared across 4a/b/c/d) ───
// Lives here because Sub 4a is the first Bloque 4 service. The
// schema is intentionally a superset that fits Manifold/Kalshi/
// Metaculus/Polymarket.
export type PredictionSource = 'manifold' | 'kalshi' | 'metaculus' | 'polymarket';
export type PredictionMarketType = 'binary' | 'multiple_choice' | 'scalar' | 'continuous_cdf';
export type PredictionMarketStatus = 'open' | 'closed' | 'resolved' | 'cancelled';
export type PredictionCurrency = 'USD' | 'MANA' | 'PTS';

export interface PredictionMarketOutcome {
  label: string;
  probability?: number;          // 0-1
  volume?: number;
}

export interface PredictionMarketRow {
  source: PredictionSource;
  sourceMarketId: string;
  sourceEventId: string | null;
  slug: string | null;
  url: string | null;
  question: string;
  description: string | null;
  category: string[];            // normalized
  rawTags: string[];             // source-native
  marketType: PredictionMarketType;
  outcomes: PredictionMarketOutcome[] | null;
  probability: number | null;    // 0-1 canonical YES for binary
  volume: number | null;
  liquidity: number | null;
  openInterest: number | null;
  currency: PredictionCurrency;
  traderCount: number | null;
  openedAt: string | null;       // ISO 8601
  closesAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  resolutionSource: string | null;
  status: PredictionMarketStatus;
  raw: unknown;                  // full source payload
}

// ─── Manifold raw response shape (verified 2026-04-09) ───
interface ManifoldSearchMarket {
  id: string;
  creatorId?: string;
  creatorUsername?: string;
  createdTime?: number;          // ms since epoch
  closeTime?: number;            // ms since epoch
  question: string;
  slug?: string;
  url?: string;
  pool?: Record<string, number>;
  probability?: number;          // 0-1, BINARY only
  p?: number;
  totalLiquidity?: number;
  outcomeType?: string;          // 'BINARY'|'MULTIPLE_CHOICE'|'PSEUDO_NUMERIC'|...
  mechanism?: string;
  volume?: number;
  volume24Hours?: number;
  isResolved?: boolean;
  resolution?: string;
  resolutionTime?: number;
  uniqueBettorCount?: number;
  lastUpdatedTime?: number;
  lastBetTime?: number;
  token?: string;                // 'MANA' typically
}

// ─── Search term map ───
// 9 normalized categories → search terms. The same Manifold market
// can match multiple categories (e.g. "Will China invade Taiwan in
// 2026?" → both `geopolitics` and `china`-search-via-geopolitics);
// merge logic in fetchAllManifoldMarkets handles dedupe.
const SEARCH_TERMS_BY_CATEGORY: Record<string, string[]> = {
  politics:    ['trump', 'biden', 'congress', 'senate', 'supreme court'],
  geopolitics: ['china', 'russia', 'ukraine', 'israel', 'iran', 'taiwan', 'nato'],
  elections:   ['election', 'primary', 'governor', 'parliament'],
  macro:       ['fed rate', 'inflation', 'recession', 'unemployment', 'gdp'],
  ai:          ['AI', 'GPT', 'AGI', 'openai', 'LLM'],
  science:     ['vaccine', 'climate', 'space', 'mars'],
  biosec:      ['pandemic', 'virus', 'outbreak', 'biosecurity'],
  crypto:      ['bitcoin', 'ethereum', 'crypto'],
  tech:        ['tesla', 'apple', 'spacex', 'meta'],
};

const MANIFOLD_BASE = 'https://api.manifold.markets/v0';
const SEARCH_LIMIT = 100;
const FETCH_TIMEOUT_MS = 15_000;
const REQUEST_PAUSE_MS = 100;   // pace ourselves: 45 calls × 100ms ≈ 5s wall, ~6 req/s vs 500/min cap

async function fetchSearchMarkets(term: string): Promise<ManifoldSearchMarket[]> {
  const url = `${MANIFOLD_BASE}/search-markets?term=${encodeURIComponent(term)}&limit=${SEARCH_LIMIT}`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) {
      console.warn(`[manifold-markets] HTTP ${r.status} for term="${term}"`);
      return [];
    }
    const j = (await r.json()) as unknown;
    if (!Array.isArray(j)) {
      console.warn(`[manifold-markets] non-array payload for term="${term}"`);
      return [];
    }
    return j as ManifoldSearchMarket[];
  } catch (err) {
    console.warn(`[manifold-markets] fetch term="${term}":`, (err as Error).message);
    return [];
  }
}

function mapOutcomeType(t: string | undefined): PredictionMarketType | null {
  if (!t) return null;
  const u = t.toUpperCase();
  if (u === 'BINARY') return 'binary';
  if (u === 'MULTIPLE_CHOICE') return 'multiple_choice';
  if (u === 'PSEUDO_NUMERIC' || u === 'NUMERIC') return 'scalar';
  return null;                   // skip QUADRATIC_FUNDING, BOUNTIED_QUESTION, POLL, etc.
}

function buildOutcomes(m: ManifoldSearchMarket, marketType: PredictionMarketType): PredictionMarketOutcome[] | null {
  if (marketType !== 'binary') return null;     // search endpoint doesn't expose multi-choice answers
  if (typeof m.probability !== 'number' || !Number.isFinite(m.probability)) return null;
  const yes = Number(m.probability);
  const no = 1 - yes;
  return [
    { label: 'YES', probability: Number(yes.toFixed(6)) },
    { label: 'NO',  probability: Number(no.toFixed(6))  },
  ];
}

function isActive(m: ManifoldSearchMarket): boolean {
  if (m.isResolved) return false;
  const v24 = typeof m.volume24Hours === 'number' ? m.volume24Hours : 0;
  const bettors = typeof m.uniqueBettorCount === 'number' ? m.uniqueBettorCount : 0;
  return v24 > 0 || bettors >= 5;
}

// PG TIMESTAMPTZ accepts year 0-9999 in the standard ISO format. Manifold
// occasionally stores `closeTime` ≈ year 10000+ for markets that "never
// close" — these come back as +010000-01-01... which PG rejects. Clamp.
const MAX_VALID_TS_MS = 253402300799999;  // 9999-12-31T23:59:59.999Z
function tsToIso(ms: number | undefined | null): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  if (ms <= 0 || ms > MAX_VALID_TS_MS) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/**
 * Fetch + dedupe + filter + map all Manifold markets matched by the
 * configured search terms. Returns rows ready for persistPredictionMarkets.
 */
export async function fetchAllManifoldMarkets(): Promise<PredictionMarketRow[]> {
  // id → { market, categories: Set<string> }
  const acc = new Map<string, { market: ManifoldSearchMarket; categories: Set<string> }>();

  for (const [category, terms] of Object.entries(SEARCH_TERMS_BY_CATEGORY)) {
    for (const term of terms) {
      const batch = await fetchSearchMarkets(term);
      for (const m of batch) {
        if (!m || !m.id || !m.question) continue;
        const existing = acc.get(m.id);
        if (existing) {
          existing.categories.add(category);
          // Refresh to most-recent payload (search ordering differs by term)
          existing.market = m;
        } else {
          acc.set(m.id, { market: m, categories: new Set([category]) });
        }
      }
      await new Promise((res) => setTimeout(res, REQUEST_PAUSE_MS));
    }
  }

  const out: PredictionMarketRow[] = [];
  for (const { market: m, categories } of acc.values()) {
    if (!isActive(m)) continue;
    const marketType = mapOutcomeType(m.outcomeType);
    if (!marketType) continue;

    const outcomes = buildOutcomes(m, marketType);
    const probability =
      marketType === 'binary' && typeof m.probability === 'number' && Number.isFinite(m.probability)
        ? Number(Number(m.probability).toFixed(6))
        : null;

    out.push({
      source: 'manifold',
      sourceMarketId: m.id,
      sourceEventId: null,
      slug: m.slug || null,
      url: m.url || (m.slug ? `https://manifold.markets/${m.creatorUsername || ''}/${m.slug}` : null),
      question: m.question,
      description: null,                      // not in search payload; would need GET /v0/market/{id}
      category: Array.from(categories).sort(),
      rawTags: [],                             // not in search payload
      marketType,
      outcomes,
      probability,
      volume: typeof m.volume === 'number' && Number.isFinite(m.volume) ? Number(m.volume) : null,
      liquidity:
        typeof m.totalLiquidity === 'number' && Number.isFinite(m.totalLiquidity)
          ? Number(m.totalLiquidity)
          : null,
      openInterest: null,
      currency: 'MANA',
      traderCount:
        typeof m.uniqueBettorCount === 'number' && Number.isFinite(m.uniqueBettorCount)
          ? Number(m.uniqueBettorCount)
          : null,
      openedAt: tsToIso(m.createdTime),
      closesAt: tsToIso(m.closeTime),
      resolvedAt: null,
      resolution: null,
      resolutionSource: null,
      status: 'open',                          // filtered to !isResolved above
      raw: m,
    });
  }

  return out;
}
