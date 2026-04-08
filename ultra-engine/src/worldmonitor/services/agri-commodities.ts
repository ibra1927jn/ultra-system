// ════════════════════════════════════════════════════════════
//  WM Phase 3 — Agri commodities (USDA Quick Stats / NASS)
//
//  USDA NASS Quick Stats API. Free, key-gated. Rate-limited but
//  generous. We fetch annual NATIONAL production for the 5 anchor
//  US crops and persist the most recent year + the year before for
//  YoY change calculation.
//
//  Used by ultra-engine/src/wm_bridge.js → runAgriCommoditiesJob →
//  wm_agri_commodities.
// ════════════════════════════════════════════════════════════

export type AgriCategory = 'grain' | 'oilseed' | 'fiber';

export interface AgriCommodityConfig {
  commodity: string;          // USDA commodity_desc
  category: AgriCategory;
  display: string;
  unit: string;               // canonical physical unit (USDA unit_desc)
  utilPractice?: string;      // optional util_practice_desc filter (CORN needs GRAIN)
}

/**
 * 5 anchor crops. Each has a unique canonical physical unit. We use
 * unit_desc as the primary disambiguator inside the (commodity, year)
 * group because USDA returns multiple rows per query.
 */
export const AGRI_COMMODITIES: AgriCommodityConfig[] = [
  { commodity: 'CORN',     category: 'grain',   display: 'US Corn Production',     unit: 'BU',           utilPractice: 'GRAIN' },
  { commodity: 'SOYBEANS', category: 'oilseed', display: 'US Soybean Production',  unit: 'BU' },
  { commodity: 'WHEAT',    category: 'grain',   display: 'US Wheat Production',    unit: 'BU' },
  { commodity: 'COTTON',   category: 'fiber',   display: 'US Cotton Production',   unit: '480 LB BALES' },
  { commodity: 'RICE',     category: 'grain',   display: 'US Rice Production',     unit: 'CWT' },
];

export interface AgriCommodityRow {
  commodity: string;
  category: AgriCategory;
  metric: 'PRODUCTION';
  display: string;
  shortDesc: string | null;
  area: string;
  period: string;             // YYYY-12-31
  reference: string | null;
  value: number;
  unit: string;
  prevValue: number | null;
  prevPeriod: string | null;
  changeAbs: number | null;
  changePct: number | null;
  loadTime: string | null;
}

interface UsdaQuickStatsRow {
  commodity_desc?: string;
  year?: number | string;
  Value?: string;
  unit_desc?: string;
  class_desc?: string;
  reference_period_desc?: string;
  util_practice_desc?: string;
  short_desc?: string;
  load_time?: string;
  agg_level_desc?: string;
  state_alpha?: string;
}

interface UsdaQuickStatsResponse {
  data?: UsdaQuickStatsRow[];
  error?: string[];
}

const QUICKSTATS_BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';

/**
 * Parse USDA's comma-formatted Value string into a JS number. Returns
 * null on missing / non-numeric / suppressed ('(D)') values.
 */
function parseUsdaValue(v: string | undefined): number | null {
  if (!v) return null;
  // Suppression codes commonly seen: '(D)' withheld, '(Z)' less than half, '(NA)'
  if (/^\(/.test(v)) return null;
  const cleaned = v.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function fetchUsdaProductionRows(
  cfg: AgriCommodityConfig,
  apiKey: string
): Promise<UsdaQuickStatsRow[]> {
  // Build query with all required Quick Stats parameters. We pull from
  // year__GE = current_year - 5 to ensure we get latest + prev even if
  // the most recent year hasn't been finalized yet.
  const minYear = new Date().getUTCFullYear() - 5;
  const params = new URLSearchParams({
    key: apiKey,
    commodity_desc: cfg.commodity,
    statisticcat_desc: 'PRODUCTION',
    agg_level_desc: 'NATIONAL',
    year__GE: String(minYear),
    format: 'JSON',
  });

  const url = `${QUICKSTATS_BASE}?${params.toString()}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      console.warn(`[agri-commodities] USDA HTTP ${r.status} for ${cfg.commodity}`);
      return [];
    }
    const j = (await r.json()) as UsdaQuickStatsResponse;
    if (j?.error?.length) {
      console.warn(`[agri-commodities] USDA error for ${cfg.commodity}:`, j.error.join(','));
      return [];
    }
    return j?.data || [];
  } catch (err) {
    console.warn(`[agri-commodities] USDA fetch ${cfg.commodity}:`, (err as Error).message);
    return [];
  }
}

/**
 * From the raw USDA rows for a single commodity, pick the canonical
 * (commodity, year) value: ALL CLASSES + reference_period='YEAR' (final
 * annual, not forecast) + matching unit_desc + matching util_practice
 * if specified. Returns rows sorted by year DESC.
 */
function selectCanonicalRows(
  cfg: AgriCommodityConfig,
  rows: UsdaQuickStatsRow[]
): UsdaQuickStatsRow[] {
  return rows
    .filter((r) => {
      if (r.unit_desc !== cfg.unit) return false;
      if (r.class_desc && r.class_desc !== 'ALL CLASSES') return false;
      if (r.reference_period_desc && r.reference_period_desc !== 'YEAR') return false;
      if (cfg.utilPractice && r.util_practice_desc !== cfg.utilPractice) return false;
      return true;
    })
    .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
}

/**
 * Fetch and normalize the most recent + prior year for every configured
 * commodity. Returns one AgriCommodityRow per commodity (the latest
 * year), with prev_value / change_pct computed inline from the year
 * before.
 */
export async function fetchAllAgriCommodities(apiKey: string): Promise<AgriCommodityRow[]> {
  if (!apiKey) throw new Error('USDA_API_KEY missing');

  const out: AgriCommodityRow[] = [];

  for (const cfg of AGRI_COMMODITIES) {
    const rawRows = await fetchUsdaProductionRows(cfg, apiKey);
    const canonical = selectCanonicalRows(cfg, rawRows);
    if (!canonical.length) {
      console.warn(`[agri-commodities] no canonical rows for ${cfg.commodity}`);
      continue;
    }

    const latest = canonical[0];
    const prev = canonical[1] || null;

    const value = parseUsdaValue(latest.Value);
    if (value === null) {
      console.warn(`[agri-commodities] non-numeric latest for ${cfg.commodity}: ${latest.Value}`);
      continue;
    }
    const year = Number(latest.year);
    if (!Number.isFinite(year)) continue;

    const prevValueRaw = prev ? parseUsdaValue(prev.Value) : null;
    const prevYear = prev ? Number(prev.year) : null;

    const changeAbs = prevValueRaw !== null ? value - prevValueRaw : null;
    const changePct =
      prevValueRaw !== null && prevValueRaw !== 0
        ? ((value - prevValueRaw) / prevValueRaw) * 100
        : null;

    out.push({
      commodity: cfg.commodity,
      category: cfg.category,
      metric: 'PRODUCTION',
      display: cfg.display,
      shortDesc: latest.short_desc || null,
      area: 'US',
      period: `${year}-12-31`,
      reference: latest.reference_period_desc || null,
      value: Number(value),
      unit: cfg.unit,
      prevValue: prevValueRaw,
      prevPeriod: prevYear !== null && Number.isFinite(prevYear) ? `${prevYear}-12-31` : null,
      changeAbs: changeAbs !== null ? Number(changeAbs.toFixed(4)) : null,
      changePct: changePct !== null ? Number(changePct.toFixed(4)) : null,
      loadTime: latest.load_time || null,
    });

    // gentle gap between commodity calls
    await new Promise((res) => setTimeout(res, 200));
  }

  return out;
}
