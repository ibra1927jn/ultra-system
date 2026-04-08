// ════════════════════════════════════════════════════════════
//  WM Phase 3 — Energy inventories (EIA v2 seriesid)
//
//  EIA Open Data API v2. Free, key-gated, no documented rate limit.
//  We use the /v2/seriesid/{id} convenience route which mirrors the
//  legacy v1 series_id query but lives under v2 — single GET, no
//  facet juggling.
//
//  Used by ultra-engine/src/wm_bridge.js → runEnergyInventoriesJob →
//  wm_energy_inventories.
// ════════════════════════════════════════════════════════════

export type EnergyCategory = 'crude' | 'gasoline' | 'distillate' | 'natgas';

export interface EnergySeriesConfig {
  seriesId: string;
  category: EnergyCategory;
  display: string;
}

/**
 * 4 weekly U.S. inventory series tracked. Order matters only for
 * deterministic output. The displayName is what shows in /world etc.
 */
export const ENERGY_SERIES: EnergySeriesConfig[] = [
  { seriesId: 'PET.WCESTUS1.W',            category: 'crude',      display: 'US Crude Oil Stocks (excl. SPR)' },
  { seriesId: 'PET.WGTSTUS1.W',            category: 'gasoline',   display: 'US Gasoline Stocks' },
  { seriesId: 'PET.WDISTUS1.W',            category: 'distillate', display: 'US Distillate Fuel Oil Stocks' },
  { seriesId: 'NG.NW2_EPG0_SWO_R48_BCF.W', category: 'natgas',     display: 'US Lower 48 Natural Gas Working Storage' },
];

export interface EnergyInventoryRow {
  seriesId: string;
  category: EnergyCategory;
  display: string;
  description: string | null;
  period: string;            // YYYY-MM-DD week-ending
  value: number;
  unit: string;
  prevValue: number | null;
  prevPeriod: string | null;
  changeAbs: number | null;
  changePct: number | null;
}

interface EiaSeriesResponse {
  response?: {
    data?: Array<{
      period?: string;
      value?: number | string;
      units?: string;
      'series-description'?: string;
    }>;
  };
  error?: string;
}

const EIA_BASE = 'https://api.eia.gov/v2/seriesid';

/**
 * Fetch the most recent N data points for a single EIA series via the
 * v2 seriesid route. Returns null on HTTP/JSON errors so callers can
 * skip the series rather than abort the whole batch.
 */
export async function fetchEiaSeries(
  seriesId: string,
  apiKey: string,
  length: number = 2
): Promise<EiaSeriesResponse['response'] | null> {
  const url = `${EIA_BASE}/${encodeURIComponent(seriesId)}?api_key=${encodeURIComponent(apiKey)}&length=${length}&sort[0][column]=period&sort[0][direction]=desc`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.warn(`[energy-inventories] EIA HTTP ${r.status} for ${seriesId}`);
      return null;
    }
    const j = (await r.json()) as EiaSeriesResponse;
    if (j?.error) {
      console.warn(`[energy-inventories] EIA error for ${seriesId}:`, j.error);
      return null;
    }
    return j?.response || null;
  } catch (err) {
    console.warn(`[energy-inventories] EIA fetch ${seriesId}:`, (err as Error).message);
    return null;
  }
}

/**
 * Fetch all configured energy series. Sequential (4 calls, no rate
 * pressure) with a tiny gap to be polite. Computes WoW change from
 * the two most recent observations returned by EIA.
 */
export async function fetchAllEnergyInventories(apiKey: string): Promise<EnergyInventoryRow[]> {
  if (!apiKey) throw new Error('EIA_API_KEY missing');

  const out: EnergyInventoryRow[] = [];

  for (const cfg of ENERGY_SERIES) {
    const resp = await fetchEiaSeries(cfg.seriesId, apiKey, 2);
    const data = resp?.data || [];
    if (!data.length) {
      console.warn(`[energy-inventories] no data for ${cfg.seriesId}`);
      continue;
    }

    const latest = data[0];
    const prev = data[1] || null;

    const value = typeof latest.value === 'number' ? latest.value : Number(latest.value);
    if (!Number.isFinite(value)) {
      console.warn(`[energy-inventories] non-numeric value for ${cfg.seriesId}:`, latest.value);
      continue;
    }
    const period = String(latest.period || '').slice(0, 10);
    if (!period) continue;

    const prevValueRaw = prev ? (typeof prev.value === 'number' ? prev.value : Number(prev.value)) : NaN;
    const prevValue = Number.isFinite(prevValueRaw) ? prevValueRaw : null;
    const prevPeriod = prev?.period ? String(prev.period).slice(0, 10) : null;

    const changeAbs = prevValue !== null ? value - prevValue : null;
    const changePct =
      prevValue !== null && prevValue !== 0 ? ((value - prevValue) / prevValue) * 100 : null;

    out.push({
      seriesId: cfg.seriesId,
      category: cfg.category,
      display: cfg.display,
      description: latest['series-description'] || null,
      period,
      value: Number(value),
      unit: latest.units || '',
      prevValue,
      prevPeriod,
      changeAbs: changeAbs !== null ? Number(changeAbs.toFixed(4)) : null,
      changePct: changePct !== null ? Number(changePct.toFixed(4)) : null,
    });

    // tiny politeness gap between sequential EIA calls
    await new Promise((res) => setTimeout(res, 100));
  }

  return out;
}
