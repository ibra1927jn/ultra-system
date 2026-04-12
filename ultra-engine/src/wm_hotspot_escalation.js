// ════════════════════════════════════════════════════════════
//  WM Hotspot Escalation — Phase 2 Step 13
//
//  Calcula un score dinámico de escalación 1.0–5.0 para cada uno
//  de los 27 INTEL_HOTSPOTS combinando 4 componentes desde tablas
//  WM ya pobladas (sin dependencias externas):
//
//   - newsActivity   (35%) — wm_clusters últimos 6h cuyo título matchea keywords
//   - ciiContribution(25%) — max(wm_country_scores.score) de los países mapeados
//   - militaryActivity(15%)— flights+vessels en radio 200km del centro
//   - geoConvergence (25%) — wm_signal_summary.convergence_zones cercanas
//
//  Se mezcla con un baseline estático (escalationScore del catálogo TS)
//  con peso 30% baseline + 70% dinámico, y se persiste en
//  wm_hotspot_escalation con trend (escalating / stable / de-escalating)
//  derivado de la diferencia 24h.
//
//  Llamado por wm_bridge.runWmHotspotEscalationJob() desde el cron
//  `wm-hotspot-escalation` (each :08 every 15 min).
// ════════════════════════════════════════════════════════════

'use strict';

// ─── Catálogo (mirror del TS INTEL_HOTSPOTS) ──────────────────
// Mantener sincronizado manualmente con worldmonitor/config/geo.ts
// Cuando se añadan hotspots ahí, replicarlos aquí.
const HOTSPOTS = [
  { id: 'sahel',          lat: 14.0,  lon:  -1.0,  baseline: 4, countries: ['ML','NE','BF'], keywords: ['burkina faso','mali','niger','sahel','junta','wagner','africa corps'] },
  { id: 'haiti',          lat: 18.5,  lon: -72.3,  baseline: 4, countries: ['HT'],           keywords: ['haiti','port-au-prince','barbecue','kenya mission'] },
  { id: 'horn_africa',    lat: 10.0,  lon:  49.0,  baseline: 4, countries: ['ET','SO','SD'], keywords: ['somalia','piracy','al-shabaab','ethiopia','somaliland','red sea'] },
  { id: 'dc',             lat: 38.9,  lon: -77.0,  baseline: 3, countries: ['US'],           keywords: ['pentagon','white house','congress','cia','nsa','washington'] },
  { id: 'silicon_valley', lat: 37.4,  lon: -122.1, baseline: 3, countries: ['US'],           keywords: ['silicon valley','san francisco','palo alto','openai','anthropic','nvidia'] },
  { id: 'wall_street',    lat: 40.7,  lon: -74.0,  baseline: 3, countries: ['US'],           keywords: ['wall street','federal reserve','nyse','nasdaq','goldman','jpmorgan','blackrock'] },
  { id: 'houston',        lat: 29.76, lon: -95.37, baseline: 3, countries: ['US'],           keywords: ['houston','nasa','spacex','exxon','chevron','lng'] },
  { id: 'moscow',         lat: 55.75, lon:  37.6,  baseline: 4, countries: ['RU'],           keywords: ['kremlin','putin','moscow','fsb'] },
  { id: 'beijing',        lat: 39.9,  lon: 116.4,  baseline: 3, countries: ['CN'],           keywords: ['beijing','xi jinping','pla','ccp'] },
  { id: 'kyiv',           lat: 50.45, lon:  30.5,  baseline: 5, countries: ['UA'],           keywords: ['kyiv','ukraine','zelensky','kiev'] },
  { id: 'taipei',         lat: 25.03, lon: 121.5,  baseline: 3, countries: ['TW'],           keywords: ['taiwan','taipei','tsmc','taiwan strait'] },
  { id: 'tehran',         lat: 35.7,  lon:  51.4,  baseline: 4, countries: ['IR'],           keywords: ['iran','tehran','irgc','khamenei'] },
  { id: 'telaviv',        lat: 32.1,  lon:  34.8,  baseline: 5, countries: ['IL'],           keywords: ['israel','idf','mossad','gaza','netanyahu','hamas','hezbollah'] },
  { id: 'pyongyang',      lat: 39.0,  lon: 125.75, baseline: 3, countries: ['KP'],           keywords: ['north korea','pyongyang','dprk','kim jong'] },
  { id: 'london',         lat: 51.5,  lon:  -0.12, baseline: 3, countries: ['GB'],           keywords: ['london','britain','gchq','mi6'] },
  { id: 'brussels',       lat: 50.85, lon:   4.35, baseline: 3, countries: ['BE'],           keywords: ['nato','brussels','european union'] },
  { id: 'caracas',        lat: 10.5,  lon: -66.9,  baseline: 3, countries: ['VE'],           keywords: ['venezuela','maduro','caracas'] },
  { id: 'nuuk',           lat: 64.18, lon: -51.7,  baseline: 3, countries: ['DK'],           keywords: ['greenland','nuuk','arctic'] },
  { id: 'riyadh',         lat: 24.7,  lon:  46.7,  baseline: 3, countries: ['SA'],           keywords: ['saudi arabia','riyadh','aramco','opec'] },
  { id: 'cairo',          lat: 30.0,  lon:  31.2,  baseline: 3, countries: ['EG'],           keywords: ['egypt','cairo','sisi','suez'] },
  { id: 'baghdad',        lat: 33.3,  lon:  44.4,  baseline: 3, countries: ['IQ'],           keywords: ['iraq','baghdad','iraqi','pmf'] },
  { id: 'damascus',       lat: 33.5,  lon:  36.3,  baseline: 3, countries: ['SY'],           keywords: ['syria','damascus','assad','hts'] },
  { id: 'doha',           lat: 25.3,  lon:  51.5,  baseline: 3, countries: ['QA'],           keywords: ['qatar','doha','al jazeera'] },
  { id: 'ankara',         lat: 39.9,  lon:  32.9,  baseline: 3, countries: ['TR'],           keywords: ['turkey','ankara','erdogan','mit'] },
  { id: 'beirut',         lat: 33.9,  lon:  35.5,  baseline: 3, countries: ['LB'],           keywords: ['lebanon','beirut','hezbollah','nasrallah'] },
  { id: 'sanaa',          lat: 15.4,  lon:  44.2,  baseline: 4, countries: ['YE'],           keywords: ['yemen','houthi','sanaa','red sea'] },
  { id: 'abudhabi',       lat: 24.5,  lon:  54.4,  baseline: 3, countries: ['AE'],           keywords: ['uae','abu dhabi','emirates','dubai'] },
];

const COMPONENT_WEIGHTS = {
  news: 0.35,
  cii: 0.25,
  geo: 0.25,
  military: 0.15,
};
const STATIC_WEIGHT = 0.30;
const DYNAMIC_WEIGHT = 0.70;
const NEWS_WINDOW_HOURS = 6;
const MILITARY_WINDOW_HOURS = 4;
const PROXIMITY_RADIUS_KM = 200;

function getHotspots() {
  return HOTSPOTS.slice();
}

// ─── Normalizers (raw → 0..100) ──────────────────────────────
function normalizeNews(matches) {
  // Saturates around 7 matches in 6h. Empirically tuned to typical
  // wm_clusters volume per hotspot keyword (3-15 matches/6h is normal).
  return Math.min(100, matches * 15);
}
function normalizeCII(score) {
  // wm_country_scores ranges roughly 0..80 in current production data
  // → scale by 1.25 to push high-tension countries closer to 100.
  if (score == null) return 30; // unknown country defaults to a middle bucket
  return Math.min(100, score * 1.25);
}
function normalizeGeo(zonesNearby, maxIntensity) {
  if (zonesNearby === 0) return 0;
  return Math.min(100, zonesNearby * 25 + maxIntensity * 10);
}
function normalizeMilitary(flights, vessels) {
  return Math.min(100, flights * 8 + vessels * 12);
}

function combinedRaw(components) {
  return (
    components.news_activity     * COMPONENT_WEIGHTS.news +
    components.cii_contribution  * COMPONENT_WEIGHTS.cii  +
    components.geo_convergence   * COMPONENT_WEIGHTS.geo  +
    components.military_activity * COMPONENT_WEIGHTS.military
  );
}

function rawToScore(raw) {
  // Map 0..100 → 1..5 (matches escalationScore scale)
  return 1 + (raw / 100) * 4;
}

function blendScores(staticBaseline, dynamicScore) {
  return staticBaseline * STATIC_WEIGHT + dynamicScore * DYNAMIC_WEIGHT;
}

function trendFromDelta(delta) {
  if (delta > 0.3) return 'escalating';
  if (delta < -0.3) return 'de-escalating';
  return 'stable';
}

// ─── Haversine (km) — used in SQL via earthdistance would need
//     extension; pure SQL with cosine approximation is sufficient. ──
// We push the geo filter into SQL using a bounding-box prefilter
// (cheap) plus an in-app haversine for accuracy on the small set
// that survives the box.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Bounding-box prefilter for SQL: ~1° latitude ≈ 111km, longitude scales with cos(lat).
function boundingBox(lat, lon, radiusKm) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLon: lon - dLon,
    maxLon: lon + dLon,
  };
}

module.exports = {
  HOTSPOTS,
  COMPONENT_WEIGHTS,
  STATIC_WEIGHT,
  DYNAMIC_WEIGHT,
  NEWS_WINDOW_HOURS,
  MILITARY_WINDOW_HOURS,
  PROXIMITY_RADIUS_KM,
  getHotspots,
  normalizeNews,
  normalizeCII,
  normalizeGeo,
  normalizeMilitary,
  combinedRaw,
  rawToScore,
  blendScores,
  trendFromDelta,
  haversineKm,
  boundingBox,
};
