// ════════════════════════════════════════════════════════════
//  WM Phase 3 — Macro indicators (FRED + World Bank)
//
//  Two sources unified into a single output shape (one row per
//  observation) so the bridge can persist them with one persist fn.
//
//   - FRED (api.stlouisfed.org): US time-series, 12 anchor series
//     covering rates, yield curve, inflation, liquidity, recession,
//     credit. Daily/weekly/monthly cadence. Key-gated.
//   - World Bank (api.worldbank.org): annual "world" indicators for
//     slow-moving structural context (3 series). No key.
//
//  Used by ultra-engine/src/wm_bridge.js → runMacroIndicatorsJob →
//  wm_macro_indicators.
// ════════════════════════════════════════════════════════════

export type MacroSource = 'FRED' | 'WORLD_BANK';
export type MacroCategory =
  | 'rates'
  | 'inflation'
  | 'employment'
  | 'liquidity'
  | 'recession'
  | 'growth'
  | 'credit'
  | 'commodity';

export interface MacroIndicatorRow {
  source: MacroSource;
  indicatorId: string;
  display: string;
  category: MacroCategory;
  area: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  period: string;            // YYYY-MM-DD
  value: number;
  unit: string | null;
  prevValue: number | null;
  prevPeriod: string | null;
  changeAbs: number | null;
  changePct: number | null;
}

interface FredSeriesConfig {
  id: string;
  display: string;
  category: MacroCategory;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  unit: string;
}

/**
 * 12 anchor FRED series spanning rates / yield curve / inflation /
 * liquidity / employment / recession / credit / commodity. All are
 * either daily, weekly, or monthly so the cron sees fresh data on
 * every 6h tick.
 */
export const FRED_SERIES: FredSeriesConfig[] = [
  { id: 'DFF',          display: 'Federal Funds Effective Rate',         category: 'rates',      frequency: 'daily',   unit: '%' },
  { id: 'DGS10',        display: '10-Year Treasury Yield',               category: 'rates',      frequency: 'daily',   unit: '%' },
  { id: 'DGS2',         display: '2-Year Treasury Yield',                category: 'rates',      frequency: 'daily',   unit: '%' },
  { id: 'T10Y2Y',       display: '10Y-2Y Treasury Spread',               category: 'rates',      frequency: 'daily',   unit: '%' },
  { id: 'T10Y3M',       display: '10Y-3M Treasury Spread',               category: 'recession',  frequency: 'daily',   unit: '%' },
  { id: 'T10YIE',       display: '10Y Inflation Breakeven',              category: 'inflation',  frequency: 'daily',   unit: '%' },
  { id: 'BAMLH0A0HYM2', display: 'ICE BofA US High Yield OAS',           category: 'credit',     frequency: 'daily',   unit: '%' },
  { id: 'WALCL',        display: 'Fed Total Assets',                     category: 'liquidity',  frequency: 'weekly',  unit: 'M USD' },
  { id: 'M2SL',         display: 'M2 Money Supply',                      category: 'liquidity',  frequency: 'monthly', unit: 'B USD' },
  { id: 'UNRATE',       display: 'US Unemployment Rate',                 category: 'employment', frequency: 'monthly', unit: '%' },
  { id: 'CPIAUCSL',     display: 'US CPI All Items',                     category: 'inflation',  frequency: 'monthly', unit: 'index' },
  { id: 'USREC',        display: 'NBER Recession Indicator',             category: 'recession',  frequency: 'monthly', unit: '0/1' },
];

interface WbIndicatorConfig {
  id: string;
  display: string;
  category: MacroCategory;
  area: string;          // 'WLD' = world aggregate
  unit: string;
}

/**
 * World Bank annual indicators for "world" context. WB is annual
 * and lags 1-2 years; we just keep the most recent non-null obs.
 *
 * NOTE: WB does NOT publish a WLD aggregate for FP.CPI.TOTL.ZG
 * (verified empty in 2026-04-08). World CPI inflation comes from
 * FRED CPIAUCSL (US-level proxy) instead. Adding more WB country
 * aggregates would belong in a future per-country expansion.
 */
export const WB_INDICATORS: WbIndicatorConfig[] = [
  { id: 'NY.GDP.MKTP.KD.ZG', display: 'World GDP Growth',     category: 'growth',     area: 'WLD', unit: '%' },
  { id: 'SL.UEM.TOTL.ZS',    display: 'World Unemployment',   category: 'employment', area: 'WLD', unit: '%' },
];

// ─── FRED ──────────────────────────────────────────────────────
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
  error_message?: string;
}

async function fetchFredObservations(
  seriesId: string,
  apiKey: string,
  limit: number = 2
): Promise<FredObservation[]> {
  const url = `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=${limit}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.warn(`[macro-indicators] FRED HTTP ${r.status} for ${seriesId}`);
      return [];
    }
    const j = (await r.json()) as FredResponse;
    if (j?.error_message) {
      console.warn(`[macro-indicators] FRED error for ${seriesId}:`, j.error_message);
      return [];
    }
    const obs = j?.observations || [];
    // FRED uses '.' for missing values — strip them so callers see only numerics
    return obs.filter((o) => o && o.value !== '.' && o.value !== '');
  } catch (err) {
    console.warn(`[macro-indicators] FRED fetch ${seriesId}:`, (err as Error).message);
    return [];
  }
}

// ─── World Bank ────────────────────────────────────────────────
const WB_BASE = 'https://api.worldbank.org/v2';

interface WbObservation {
  date: string;
  value: number | null;
}

async function fetchWbLatest(
  indicatorId: string,
  area: string
): Promise<{ latest: WbObservation; prev: WbObservation | null } | null> {
  // per_page large enough to skip several null/forward-looking rows
  const url = `${WB_BASE}/country/${encodeURIComponent(area)}/indicator/${encodeURIComponent(indicatorId)}?format=json&per_page=10`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.warn(`[macro-indicators] WB HTTP ${r.status} for ${indicatorId}/${area}`);
      return null;
    }
    const j = (await r.json()) as unknown;
    if (!Array.isArray(j) || j.length < 2 || !Array.isArray(j[1])) {
      console.warn(`[macro-indicators] WB unexpected payload for ${indicatorId}`);
      return null;
    }
    const rows = j[1] as Array<{ date: string; value: number | null }>;
    // WB returns most recent year first. Skip nulls to find the latest
    // observed value, then the next non-null as prev.
    const nonNull = rows.filter((r) => r && typeof r.value === 'number' && r.value !== null);
    if (!nonNull.length) return null;
    return {
      latest: { date: String(nonNull[0].date), value: nonNull[0].value as number },
      prev: nonNull[1] ? { date: String(nonNull[1].date), value: nonNull[1].value as number } : null,
    };
  } catch (err) {
    console.warn(`[macro-indicators] WB fetch ${indicatorId}/${area}:`, (err as Error).message);
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Fetch the most recent observation (+ prior obs for change calc) for
 * every configured FRED + WB series. FRED is sequential to be polite
 * (12 calls × ~150ms ≈ 2s); WB is sequential too (3 calls). Total
 * wall clock ≈ 3-4s.
 */
export async function fetchAllMacroIndicators(
  fredApiKey: string
): Promise<MacroIndicatorRow[]> {
  if (!fredApiKey) throw new Error('FRED_API_KEY missing');

  const out: MacroIndicatorRow[] = [];

  // ─── FRED ──
  for (const cfg of FRED_SERIES) {
    const obs = await fetchFredObservations(cfg.id, fredApiKey, 2);
    if (!obs.length) {
      console.warn(`[macro-indicators] FRED ${cfg.id}: no observations`);
      continue;
    }
    const latest = obs[0];
    const prev = obs[1] || null;

    const value = Number(latest.value);
    if (!Number.isFinite(value)) continue;

    const prevValueRaw = prev ? Number(prev.value) : NaN;
    const prevValue = Number.isFinite(prevValueRaw) ? prevValueRaw : null;
    const prevPeriod = prev?.date || null;

    const changeAbs = prevValue !== null ? value - prevValue : null;
    const changePct =
      prevValue !== null && prevValue !== 0 ? ((value - prevValue) / prevValue) * 100 : null;

    out.push({
      source: 'FRED',
      indicatorId: cfg.id,
      display: cfg.display,
      category: cfg.category,
      area: 'US',
      frequency: cfg.frequency,
      period: latest.date,
      value: Number(value.toFixed(6)),
      unit: cfg.unit,
      prevValue: prevValue !== null ? Number(prevValue.toFixed(6)) : null,
      prevPeriod,
      changeAbs: changeAbs !== null ? Number(changeAbs.toFixed(6)) : null,
      changePct: changePct !== null ? Number(changePct.toFixed(4)) : null,
    });

    await new Promise((res) => setTimeout(res, 120));
  }

  // ─── World Bank ──
  for (const cfg of WB_INDICATORS) {
    const got = await fetchWbLatest(cfg.id, cfg.area);
    if (!got) {
      console.warn(`[macro-indicators] WB ${cfg.id}/${cfg.area}: no data`);
      continue;
    }
    const value = got.latest.value;
    const prevValue = got.prev ? got.prev.value : null;
    const changeAbs = prevValue !== null ? value - prevValue : null;
    const changePct =
      prevValue !== null && prevValue !== 0 ? ((value - prevValue) / prevValue) * 100 : null;

    // WB date is a year string ('2024') — store as Dec 31 of that year
    // so it sorts naturally alongside FRED daily/monthly dates.
    const period = `${got.latest.date}-12-31`;
    const prevPeriod = got.prev ? `${got.prev.date}-12-31` : null;

    out.push({
      source: 'WORLD_BANK',
      indicatorId: cfg.id,
      display: cfg.display,
      category: cfg.category,
      area: cfg.area,
      frequency: 'annual',
      period,
      value: Number(value.toFixed(6)),
      unit: cfg.unit,
      prevValue: prevValue !== null ? Number(prevValue.toFixed(6)) : null,
      prevPeriod,
      changeAbs: changeAbs !== null ? Number(changeAbs.toFixed(6)) : null,
      changePct: changePct !== null ? Number(changePct.toFixed(4)) : null,
    });

    await new Promise((res) => setTimeout(res, 100));
  }

  return out;
}
