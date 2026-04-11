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

// 29 países hotspot — sincronizados con wm_hotspot_escalation.HOTSPOTS.
// Si añades hotspots ahí, replicarlos aquí (mismo patrón que el módulo
// hermano).
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
  'GL', 'DK',                 // nuuk
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
const Z_MEDIUM = 2.0;
const Z_HIGH = 3.0;
const Z_CRITICAL = 4.0;
const BASELINE_DAYS = 28;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  const sourceCountryQuery = `sourcecountry:${country}`;

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
    return { country, persisted: 0, alert: null };
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

  if (std === 0) {
    return { country, persisted, alert: null, reason: 'zero_std' };
  }

  const z = (currentVolume - mean) / std;

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
    [country, latestDate, currentVolume, mean, std, z, currentTone, baselineTone, severity, topUrl, topTitle]
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

  for (let i = 0; i < countries.length; i++) {
    const c = countries[i];
    try {
      const t = await fetchCountryTimeline(c);
      if (t.error) {
        console.error(`[wm-gdelt-geo] ${c} fetch error: ${t.error}`);
        results.push({ country: c, error: t.error });
        continue;
      }
      const volMap = timelineToMap(t.volume);
      const toneMap = timelineToMap(t.tone);
      const r = await persistAndAnalyze(c, volMap, toneMap);
      results.push(r);
      totalPersisted += r.persisted || 0;
      if (r.alert) {
        totalAlerts++;
        console.log(`[wm-gdelt-geo] 🚨 ${c} alert z=${r.alert.z.toFixed(2)} sev=${r.alert.severity}`);
      }
    } catch (err) {
      console.error(`[wm-gdelt-geo] ${c} unexpected error:`, err.message);
      results.push({ country: c, error: err.message });
    }
    // No inter-country stagger: gdelt_throttle.acquire() in
    // gdeltFetchJSON enforces global pacing across all callers.
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[wm-gdelt-geo] cycle done: countries=${countries.length} persisted=${totalPersisted} alerts=${totalAlerts} elapsed=${elapsedSec}s`
  );
  return { countries: countries.length, persisted: totalPersisted, alerts: totalAlerts, elapsedSec, results };
}

module.exports = {
  runOnce,
  HOTSPOT_COUNTRIES,
  severityFromZ,
  // exposed for tests
  timelineToMap,
  parseGdeltDate,
};
