// ════════════════════════════════════════════════════════════
//  WM GDELT GEO — P1 finalization B4
//
//  Reinterpretación del lote B4 original (CAST/GEO 2.0/Context 2.0)
//  tras descubrir que /api/v2/geo/geo y /cast/cast están deprecados
//  (404 stable). Substitución usando GDELT DOC API timeline modes:
//
//    - mode=TimelineVolInfo  → daily volume intensity por país
//                              (fracción de cobertura GDELT global,
//                               +top URLs del día más caliente)
//    - mode=TimelineTone     → daily average tone por país
//
//  Pipeline:
//    1. Para cada uno de los 29 países hotspot (sourcecountry:XX),
//       fetch TimelineVolInfo + TimelineTone con stagger 5s.
//    2. UPSERT diario en wm_gdelt_geo_timeline (UNIQUE country,date).
//    3. Compute z-score: (today_volume - mean_28d) / std_28d.
//       Si z >= 2.0 → INSERT en wm_gdelt_volume_alerts y publish
//       evento 'gdelt.spike' en eventbus.
//    4. Severity:
//       - z 2.0–3.0  = medium
//       - z 3.0–4.0  = high
//       - z >= 4.0   = critical
//    5. Tone delta: mantenemos current_tone y baseline_tone para
//       contexto en el alert (negative spike + volume spike = real
//       escalation; volume spike + neutral tone = noise/coverage).
//
//  Rate limit GDELT: empíricamente 1 req/5s. 29 países × 2 reqs = 58
//  reqs × 5s ≈ 5 min por ciclo completo. Cron cada 6h = 4 ciclos/día.
//
//  Llamado por wm_bridge.runWmGdeltGeoJob() desde scheduler cron
//  `wm-gdelt-geo` (each :22 every 6h: 00:22, 06:22, 12:22, 18:22).
// ════════════════════════════════════════════════════════════

'use strict';

const db = require('./db');
const eventbus = require('./eventbus');
const throttle = require('./gdelt_throttle');

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Tuning — Since 2026-04-10 pacing is enforced by `gdelt_throttle`
// (process-wide gate shared with wm_gdelt_intel). No internal stagger
// remains — we only await throttle.acquire() before each fetch and
// report throttling back on 429/non-json so the throttle applies a
// global cooldown that also holds back intel calls.
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 4;
const TIMESPAN = '30d';

// ─── ISO-3166 → FIPS 10-4 mapping ──────────────────────────
// GDELT DOC API uses FIPS 10-4 country codes for `sourcecountry:`,
// not ISO 3166. Empirically verified 2026-04-11:
//   sourcecountry:CN → 0 results, sourcecountry:CH → 30 days of data
//   sourcecountry:KP → 0 results, sourcecountry:KN → 30 days of data
//
// Until 2026-04-11 we sent ISO codes blindly. Result was a two-pronged
// silent bug:
//   1. 14 hotspots with ISO≠FIPS returned empty timelines (RU, CN, UA,
//      IL, KP, TR, IQ, LB, YE, HT, SD, DK + SY/TW/GL coincidentally
//      same in both schemes).
//   2. 4 hotspots whose ISO codes happen to be valid FIPS for *other*
//      countries persisted GARBAGE under the wrong label:
//        GB (UK in ISO) → FIPS Gabon
//        NE (Niger ISO) → FIPS Niue
//        BF (Burkina ISO) → FIPS Bahamas
//        AE (UAE ISO)   → FIPS something else
//      Their rows were purged in this commit so the next cycle re-seeds
//      them with the correct FIPS code.
const ISO_TO_FIPS = {
  // GDELT DOC API uses FIPS 10-4, not ISO 3166-1 alpha-2.
  // Only entries where FIPS differs from ISO are listed.
  // Anything not here falls through to identity (many coincide).
  AT: 'AU', // Austria
  AU: 'AS', // Australia
  BD: 'BG', // Bangladesh
  BF: 'UV', // Burkina Faso
  BI: 'BY', // Burundi
  BN: 'BX', // Brunei
  BO: 'BL', // Bolivia
  BS: 'BF', // Bahamas
  BW: 'BC', // Botswana
  BY: 'BO', // Belarus
  CD: 'CG', // DR Congo
  CH: 'SZ', // Switzerland
  CI: 'IV', // Côte d'Ivoire
  CL: 'CI', // Chile
  CN: 'CH', // China
  CU: 'CU', // Cuba (same)
  CZ: 'EZ', // Czechia
  DE: 'GM', // Germany
  DK: 'DA', // Denmark
  DO: 'DR', // Dominican Republic
  DZ: 'AG', // Algeria
  EC: 'EC', // Ecuador (same)
  EE: 'EN', // Estonia
  FI: 'FI', // Finland (same)
  GB: 'UK', // United Kingdom
  GE: 'GG', // Georgia
  GR: 'GR', // Greece (same)
  GT: 'GT', // Guatemala (same)
  HK: 'HK', // Hong Kong (same)
  HN: 'HO', // Honduras
  HR: 'HR', // Croatia (same)
  HT: 'HA', // Haiti
  HU: 'HU', // Hungary (same)
  ID: 'ID', // Indonesia (same)
  IE: 'EI', // Ireland
  IL: 'IS', // Israel
  IQ: 'IZ', // Iraq
  IS: 'IC', // Iceland
  JO: 'JO', // Jordan (same)
  JP: 'JA', // Japan
  KG: 'KG', // Kyrgyzstan (same)
  KH: 'CB', // Cambodia
  KP: 'KN', // North Korea
  KR: 'KS', // South Korea
  LB: 'LE', // Lebanon
  LT: 'LH', // Lithuania
  LV: 'LG', // Latvia
  MA: 'MO', // Morocco
  MD: 'MD', // Moldova (same)
  MM: 'BM', // Myanmar
  MY: 'MY', // Malaysia (same)
  NE: 'NG', // Niger
  NG: 'NI', // Nigeria
  NL: 'NL', // Netherlands (same)
  NO: 'NO', // Norway (same)
  NP: 'NP', // Nepal (same)
  NZ: 'NZ', // New Zealand (same)
  PE: 'PE', // Peru (same)
  PH: 'RP', // Philippines
  PK: 'PK', // Pakistan (same)
  PL: 'PL', // Poland (same)
  RO: 'RO', // Romania (same)
  RS: 'RI', // Serbia
  RU: 'RS', // Russia
  SD: 'SU', // Sudan
  SE: 'SW', // Sweden
  SG: 'SN', // Singapore
  SI: 'SI', // Slovenia (same)
  SK: 'LO', // Slovakia
  SN: 'SG', // Senegal
  SR: 'NS', // Suriname
  TH: 'TH', // Thailand (same)
  TN: 'TS', // Tunisia
  TR: 'TU', // Turkey
  UA: 'UP', // Ukraine
  UY: 'UY', // Uruguay (same)
  VN: 'VM', // Vietnam
  YE: 'YM', // Yemen
  ZA: 'SF', // South Africa
  ZM: 'ZA', // Zambia
};

function isoToFips(iso) {
  return ISO_TO_FIPS[iso] || iso;
}

// 28 países hotspot — sincronizados con wm_hotspot_escalation.HOTSPOTS.
// Si añades hotspots ahí, replicarlos aquí (mismo patrón que el módulo
// hermano). Storage stays in ISO; we translate to FIPS only when
// querying GDELT (see fetchCountryTimeline).
const HOTSPOT_COUNTRIES = [
  'ML', 'NE', 'BF',          // sahel
  'HT',                       // haiti
  'ET', 'SO', 'SD',          // horn of africa
  'US',                       // dc / silicon valley / wall street / houston
  'RU',                       // moscow
  'CN',                       // beijing
  'UA',                       // kyiv
  'TW',                       // taipei
  'IR',                       // tehran
  'IL',                       // tel aviv
  'KP',                       // pyongyang
  'GB',                       // london
  'BE',                       // brussels
  'VE',                       // caracas
  'DK',                        // nuuk (GL removed: GDELT returns {} for Greenland)
  'SA',                       // riyadh
  'EG',                       // cairo
  'IQ',                       // baghdad
  'SY',                       // damascus
  'QA',                       // doha
  'TR',                       // ankara
  'LB',                       // beirut
  'YE',                       // sanaa
  'AE',                       // abu dhabi
];

// Z-score thresholds
const Z_MEDIUM = 2.5;   // raised from 2.0 — immature baseline (30d) triggers noise at 2.0
const Z_HIGH = 3.5;
const Z_CRITICAL = 5.0;
const BASELINE_DAYS = 28;

function severityFromZ(z) {
  if (z >= Z_CRITICAL) return 'critical';
  if (z >= Z_HIGH) return 'high';
  if (z >= Z_MEDIUM) return 'medium';
  return 'low';
}

// ─── HTTP helper with throttle + retry ──────────────────────
async function gdeltFetchJSON(params) {
  const url = new URL(GDELT_DOC_API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('format', 'JSON');

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Wait for our turn on the global GDELT gate. This also enforces
    // the cooldown if another caller reported a 429 recently.
    await throttle.acquire();
    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`GDELT HTTP ${res.status}`);
        throttle.reportThrottled(); // global cooldown
        continue;
      }
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const text = await res.text();
      try {
        return { ok: true, data: JSON.parse(text) };
      } catch {
        // GDELT serves an HTML/plain error page when rate-limited —
        // treat as retriable throttle and raise the global cooldown.
        lastErr = new Error('non-json response (likely throttled)');
        throttle.reportThrottled();
        if (attempt < MAX_ATTEMPTS) continue;
        return { ok: false, error: 'non-json response' };
      }
    } catch (err) {
      // Network error / timeout — not definitively a throttle, but
      // GDELT tends to drop connections when overloaded, so apply a
      // shorter cooldown than the throttle default.
      lastErr = err;
      throttle.reportThrottled(15_000);
    }
  }
  return { ok: false, error: lastErr ? lastErr.message : 'unknown' };
}

// ─── Parse "20260408T000000Z" → "2026-04-08" ────────────────
function parseGdeltDate(s) {
  if (!s || typeof s !== 'string' || s.length < 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ─── Fetch one country's full timeline (vol + tone) ─────────
async function fetchCountryTimeline(country) {
  // Translate ISO → FIPS for GDELT (DOC API uses FIPS 10-4).
  // We persist the original ISO `country` in the DB for consistency.
  const sourceCountryQuery = `sourcecountry:${isoToFips(country)}`;

  // 1. Volume intensity timeline (+top URLs per day). The global
  //    throttle inside gdeltFetchJSON enforces pacing between this
  //    call and the tone call below (and any concurrent intel calls).
  const volRes = await gdeltFetchJSON({
    query: sourceCountryQuery,
    mode: 'TimelineVolInfo',
    timespan: TIMESPAN,
  });
  if (!volRes.ok) {
    return { country, error: `volume: ${volRes.error}` };
  }

  // 2. Tone timeline
  const toneRes = await gdeltFetchJSON({
    query: sourceCountryQuery,
    mode: 'TimelineTone',
    timespan: TIMESPAN,
  });
  if (!toneRes.ok) {
    // Volume worked, tone failed — keep volume only
    return { country, volume: volRes.data, tone: null, partial: true };
  }

  return { country, volume: volRes.data, tone: toneRes.data };
}

// ─── Build day-keyed map from a GDELT timeline series ───────
function timelineToMap(data, seriesKey = 'data') {
  const out = new Map();
  const series = Array.isArray(data?.timeline) ? data.timeline : [];
  if (!series.length) return out;
  const points = Array.isArray(series[0][seriesKey]) ? series[0][seriesKey] : [];
  for (const p of points) {
    const d = parseGdeltDate(p.date);
    if (d != null && typeof p.value === 'number' && isFinite(p.value)) {
      out.set(d, { value: p.value, toparts: Array.isArray(p.toparts) ? p.toparts : [] });
    }
  }
  return out;
}

// ─── UPSERT timeline rows + compute z-score for latest day ──
async function persistAndAnalyze(country, volMap, toneMap) {
  if (!volMap || !volMap.size) {
    return { country, persisted: 0, alert: null, reason: 'empty_timeline' };
  }

  const dates = [...volMap.keys()].sort(); // ascending
  let persisted = 0;

  // UPSERT each (country, date) row
  for (const d of dates) {
    const v = volMap.get(d);
    const t = toneMap?.get(d);
    await db.query(
      `INSERT INTO wm_gdelt_geo_timeline
         (country, date, volume_intensity, avg_tone, fetched_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (country, date) DO UPDATE SET
         volume_intensity = EXCLUDED.volume_intensity,
         avg_tone         = EXCLUDED.avg_tone,
         fetched_at       = NOW()`,
      [country, d, v.value, t?.value ?? null]
    );
    persisted++;
  }

  // ─── Z-score: today vs prior 28 days ───
  // Use the LATEST date in the volume map as "current"
  const latestDate = dates[dates.length - 1];
  const latestPoint = volMap.get(latestDate);
  const currentVolume = latestPoint.value;

  // Baseline: dates strictly before latest, last BASELINE_DAYS rows
  const baselineDates = dates.slice(-1 - BASELINE_DAYS, -1);
  const baselineVols = baselineDates.map(d => volMap.get(d).value).filter(x => isFinite(x));

  if (baselineVols.length < 14) {
    // Not enough history yet — skip alert computation, just persist
    return { country, persisted, alert: null, reason: 'baseline_too_short' };
  }

  const mean = baselineVols.reduce((a, b) => a + b, 0) / baselineVols.length;
  const variance = baselineVols.reduce((a, b) => a + (b - mean) ** 2, 0) / baselineVols.length;
  const std = Math.sqrt(variance);

  // Skip alert computation when baseline volume is negligible — countries
  // with mean<0.3 have so little GDELT coverage that any fluctuation
  // produces z-scores of 30-50 (e.g. AE mean=0.12 → z=51 on a normal day).
  const MIN_BASELINE_MEAN = 0.3;
  if (mean < MIN_BASELINE_MEAN) {
    return { country, persisted, alert: null, reason: 'baseline_too_low' };
  }

  // Floor std to 10% of mean to prevent spurious alerts when baseline
  // variance is near-zero (immature data).
  const STD_FLOOR_PCT = 0.10;
  const stdFloor = Math.max(std, mean * STD_FLOOR_PCT, 0.01);

  const z = (currentVolume - mean) / stdFloor;

  if (z < Z_MEDIUM) {
    return { country, persisted, alert: null, z };
  }

  // Build alert
  const severity = severityFromZ(z);
  const baselineTones = baselineDates
    .map(d => toneMap?.get(d)?.value)
    .filter(x => typeof x === 'number' && isFinite(x));
  const baselineTone = baselineTones.length
    ? baselineTones.reduce((a, b) => a + b, 0) / baselineTones.length
    : null;
  const currentTone = toneMap?.get(latestDate)?.value ?? null;

  const topPart = latestPoint.toparts?.[0] || null;
  const topUrl = topPart?.url || null;
  const topTitle = topPart?.title ? String(topPart.title).slice(0, 500) : null;

  const inserted = await db.queryOne(
    `INSERT INTO wm_gdelt_volume_alerts
       (country, alert_date, current_volume, baseline_mean, baseline_std,
        z_score, current_tone, baseline_tone, severity, top_url, top_title)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (country, alert_date) DO UPDATE SET
       current_volume = EXCLUDED.current_volume,
       baseline_mean  = EXCLUDED.baseline_mean,
       baseline_std   = EXCLUDED.baseline_std,
       z_score        = EXCLUDED.z_score,
       current_tone   = EXCLUDED.current_tone,
       baseline_tone  = EXCLUDED.baseline_tone,
       severity       = EXCLUDED.severity,
       top_url        = EXCLUDED.top_url,
       top_title      = EXCLUDED.top_title
     RETURNING id, notified`,
    [country, latestDate, currentVolume, mean, stdFloor, z, currentTone, baselineTone, severity, topUrl, topTitle]
  );

  // Fire-and-forget event publish — let downstream handlers (telegram,
  // hotspot escalation merge, etc.) react. event_log persists synchronously.
  if (inserted && !inserted.notified) {
    eventbus.publish('gdelt.spike', 'P1', {
      alert_id: inserted.id,
      country,
      alert_date: latestDate,
      z_score: z,
      severity,
      current_volume: currentVolume,
      baseline_mean: mean,
      current_tone: currentTone,
      baseline_tone: baselineTone,
      top_url: topUrl,
      top_title: topTitle,
    }).catch(err => console.error('gdelt.spike publish error:', err.message));
  }

  return { country, persisted, alert: { z, severity, latestDate } };
}

// ─── Public entry: fetch all hotspot countries sequentially ─
async function runOnce({ countries = HOTSPOT_COUNTRIES } = {}) {
  const startedAt = Date.now();
  const results = [];
  let totalPersisted = 0;
  let totalAlerts = 0;
  // Per-country outcome buckets for end-of-cycle diagnostic
  const buckets = { ok: [], empty: [], fetch_err: [], unexpected: [], partial_tone: [] };

  // 2026-04-11: shuffle so the tail (which catches GDELT 429 cooldowns
  // toward end of cycle) rotates instead of always burning the same
  // last ~6 countries. Pre-shuffle bias left SY/LB/AE permanently
  // unpersisted at positions 22/26/29.
  const shuffled = countries.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  countries = shuffled;

  for (let i = 0; i < countries.length; i++) {
    const c = countries[i];
    try {
      const t = await fetchCountryTimeline(c);
      if (t.error) {
        console.error(`[wm-gdelt-geo] ${c} fetch error: ${t.error}`);
        results.push({ country: c, error: t.error });
        buckets.fetch_err.push(`${c}(${t.error.slice(0, 20)})`);
        continue;
      }
      const volMap = timelineToMap(t.volume);
      const toneMap = timelineToMap(t.tone);
      const r = await persistAndAnalyze(c, volMap, toneMap);
      results.push(r);
      totalPersisted += r.persisted || 0;
      if (r.reason === 'empty_timeline') {
        buckets.empty.push(c);
        console.log(`[wm-gdelt-geo] ${c} skip: empty_timeline (vol_series=${(t.volume?.timeline || []).length})`);
      } else {
        buckets.ok.push(`${c}=${r.persisted}`);
        if (t.partial) buckets.partial_tone.push(c);
      }
      if (r.alert) {
        totalAlerts++;
        console.log(`[wm-gdelt-geo] 🚨 ${c} alert z=${r.alert.z.toFixed(2)} sev=${r.alert.severity}`);
      }
    } catch (err) {
      console.error(`[wm-gdelt-geo] ${c} unexpected error:`, err.message);
      results.push({ country: c, error: err.message });
      buckets.unexpected.push(c);
    }
    // No inter-country stagger: gdelt_throttle.acquire() in
    // gdeltFetchJSON enforces global pacing across all callers.
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[wm-gdelt-geo] cycle done: countries=${countries.length} ok=${buckets.ok.length} empty=${buckets.empty.length} fetch_err=${buckets.fetch_err.length} unexpected=${buckets.unexpected.length} persisted=${totalPersisted} alerts=${totalAlerts} elapsed=${elapsedSec}s`
  );
  if (buckets.empty.length) console.log(`[wm-gdelt-geo] empty_timeline countries: ${buckets.empty.join(',')}`);
  if (buckets.fetch_err.length) console.log(`[wm-gdelt-geo] fetch_err countries: ${buckets.fetch_err.join(',')}`);
  return { countries: countries.length, persisted: totalPersisted, alerts: totalAlerts, elapsedSec, results, buckets };
}

// Tier B: countries with 3+ feeds but not in Tier A hotspots
const EXPANDED_COUNTRIES = [
  'ES','IN','IT','FR','PL','CA','DE','MX','PH','BR','JP','PK',
  'ZA','GE','AT','PE','HU','ID','ME','KG','PT','BD','GR','AU',
  'CL','CZ','KR','AM','SG','EE','SK','IE','BG','NG','CH',
  'SE','SR','LV','FI','RS','IS','DO','TH','MA','MM','VN',
  'NZ','AR','NL','SN','CM','SI','BY','SM','LT','CY','BB',
  'NO','BA','CO','DZ','AZ','UY','IQ','CN','NE','ZM','SD',
  'MY','HK','NP','BO','TW','RO','BI','AF','LB','MD','JO','HR',
].filter(c => !HOTSPOT_COUNTRIES.includes(c));

module.exports = {
  runOnce,
  HOTSPOT_COUNTRIES,
  EXPANDED_COUNTRIES,
  ISO_TO_FIPS,
  isoToFips,
  severityFromZ,
  // exposed for tests
  timelineToMap,
  parseGdeltDate,
};
