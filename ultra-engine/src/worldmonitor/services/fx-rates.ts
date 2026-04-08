// ════════════════════════════════════════════════════════════
//  WM Phase 3 — FX rates (Frankfurter / ECB ref rates)
//
//  Frankfurter is a free public mirror of the ECB Statistical Data
//  Warehouse. No auth, no key, no documented rate limit. ECB publishes
//  daily reference rates ~16:00 CET on TARGET working days. Weekends
//  and ECB holidays return the previous publication date.
//
//  Used by ultra-engine/src/wm_bridge.js → runFxRatesJob → wm_fx_rates.
// ════════════════════════════════════════════════════════════

/**
 * 18 majors quoted against USD. ECB doesn't publish RUB anymore so
 * it's intentionally absent. Order is alphabetical for deterministic
 * test output.
 */
export const FX_QUOTES: string[] = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'HKD', 'INR',
  'JPY', 'KRW', 'MXN', 'NOK', 'NZD', 'SEK', 'SGD', 'TRY', 'ZAR',
];

export const FX_BASE = 'USD';

export interface FxRateRow {
  base: string;
  quote: string;
  rate: number;
  rateDate: string;       // YYYY-MM-DD
  prevRate: number | null;
  prevDate: string | null;
  changeAbs: number | null;
  changePct: number | null;
}

interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

async function fetchFrankfurter(path: string): Promise<FrankfurterResponse | null> {
  const url = `${FRANKFURTER_BASE}${path}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 UltraSystem-WorldMonitor/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) {
      console.warn(`[fx-rates] Frankfurter HTTP ${r.status} for ${path}`);
      return null;
    }
    return (await r.json()) as FrankfurterResponse;
  } catch (err) {
    console.warn(`[fx-rates] Frankfurter fetch ${path}:`, (err as Error).message);
    return null;
  }
}

/**
 * Fetch latest USD-base rates for the configured quote list, plus the
 * previous trading day's rates so we can compute change_abs / change_pct
 * inline. The "previous" call uses the historical /v1/{date} endpoint
 * with the day BEFORE the latest publication — Frankfurter resolves
 * weekends/holidays automatically by returning the most recent prior
 * trading day.
 */
export async function fetchAllFxRates(): Promise<FxRateRow[]> {
  const symbols = FX_QUOTES.join(',');
  const latest = await fetchFrankfurter(`/latest?base=${FX_BASE}&symbols=${symbols}`);
  if (!latest || !latest.rates || !latest.date) {
    throw new Error('Frankfurter /latest returned no data');
  }

  const latestDate = String(latest.date).slice(0, 10);

  // Compute "day before latest publication" — Frankfurter will jump back
  // to the previous trading day on its own if that's a weekend/holiday.
  const prevQueryDate = (() => {
    const d = new Date(`${latestDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const prev = await fetchFrankfurter(`/${prevQueryDate}?base=${FX_BASE}&symbols=${symbols}`);
  const prevRates = prev?.rates || {};
  const prevDate = prev?.date ? String(prev.date).slice(0, 10) : null;

  const out: FxRateRow[] = [];
  for (const quote of FX_QUOTES) {
    const rate = latest.rates[quote];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) continue;

    const prevRate = typeof prevRates[quote] === 'number' ? prevRates[quote] : null;
    const changeAbs = prevRate !== null ? rate - prevRate : null;
    const changePct =
      prevRate !== null && prevRate !== 0 ? ((rate - prevRate) / prevRate) * 100 : null;

    out.push({
      base: FX_BASE,
      quote,
      rate: Number(rate),
      rateDate: latestDate,
      prevRate,
      prevDate,
      changeAbs: changeAbs !== null ? Number(changeAbs.toFixed(8)) : null,
      changePct: changePct !== null ? Number(changePct.toFixed(4)) : null,
    });
  }

  return out;
}
