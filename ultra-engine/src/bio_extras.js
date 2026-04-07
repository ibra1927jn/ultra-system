// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Bio extras (P7 Tier A stubs)              ║
// ║                                                            ║
// ║  Stubs gated por env vars para integrar:                   ║
// ║   • USDA FoodData Central (free key)                       ║
// ║   • OpenUV API (UV index, free key)                        ║
// ║   • CalorieNinjas NL parsing (free key)                    ║
// ║                                                            ║
// ║  Para wearables OAuth (Fitbit/Oura/Withings) ya existe la  ║
// ║  ruta /webhooks/wearable que acepta cualquier device. Estos║
// ║  stubs son fetchers proactivos que polean APIs cuando se   ║
// ║  añaden las credenciales correspondientes.                 ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; UltraSystem/1.0)' };
const TIMEOUT = 15000;

// ════════════════════════════════════════════════════════════
//  USDA FoodData Central — comprehensive US nutrition database
//  Docs: https://fdc.nal.usda.gov/api-guide.html
// ════════════════════════════════════════════════════════════
async function searchUSDAFood(query) {
  const key = process.env.USDA_API_KEY;
  if (!key) return { skipped: 'USDA_API_KEY no configurada' };
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=10&api_key=${key}`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`USDA HTTP ${r.status}`);
    const data = await r.json();
    return { source: 'usda', foods: data.foods || [] };
  } catch (err) {
    return { source: 'usda', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  OpenUV API — UV index by lat/lon
//  Docs: https://www.openuv.io/api
// ════════════════════════════════════════════════════════════
// 2026-04-07: OpenUV requiere key gated. Pivot a Open-Meteo (free, no auth).
// Devuelve uv_index_max + uv_index_clear_sky_max para 3 días forecast.
// Persiste cada día como una fila separada en bio_environmental con metric='uv_index_max'.
// Mantiene compat con el cron existente que llama fetchOpenUV().
async function fetchOpenUV({ lat = -36.85, lon = 174.76 } = {}) {
  // Asegura tabla compatible con schema legacy generic K/V
  await db.query(
    `CREATE TABLE IF NOT EXISTS bio_environmental (
       id SERIAL PRIMARY KEY,
       source TEXT NOT NULL,
       metric TEXT NOT NULL,
       value NUMERIC,
       unit TEXT,
       latitude DOUBLE PRECISION,
       longitude DOUBLE PRECISION,
       measured_at TIMESTAMPTZ,
       payload JSONB
     )`
  );

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=uv_index_max,uv_index_clear_sky_max&forecast_days=3&timezone=UTC`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`open-meteo HTTP ${r.status}`);
    const data = await r.json();
    const days = data?.daily?.time || [];
    let inserted = 0;
    for (let i = 0; i < days.length; i++) {
      const date = days[i];
      const uvMax = data.daily.uv_index_max?.[i];
      if (uvMax == null) continue;
      const uvClear = data.daily.uv_index_clear_sky_max?.[i];
      // Idempotencia ad-hoc: skip si ya existe (source, metric, lat, lon, measured_at)
      const exists = await db.queryOne(
        `SELECT id FROM bio_environmental
          WHERE source='open_meteo' AND metric='uv_index_max'
            AND latitude=$1 AND longitude=$2 AND measured_at=$3 LIMIT 1`,
        [lat, lon, date]
      );
      if (exists) continue;
      await db.query(
        `INSERT INTO bio_environmental (source, metric, value, unit, latitude, longitude, measured_at, payload)
         VALUES ('open_meteo', 'uv_index_max', $1, 'index', $2, $3, $4, $5)`,
        [uvMax, lat, lon, date, JSON.stringify({ uv_clear_sky_max: uvClear })]
      );
      inserted++;
    }
    return { source: 'open_meteo_uv', lat, lon, days: days.length, inserted };
  } catch (err) {
    return { source: 'open_meteo_uv', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  Nutrition NL search — fallback chain CalorieNinjas → OFF
//  2026-04-07: si CALORIE_NINJAS_KEY no está, usa Open Food Facts
//  search (free, no auth) que da resultados decentes para queries
//  cortas tipo "100g chicken breast" → matches en el catálogo OFF.
// ════════════════════════════════════════════════════════════
async function parseNutrition(naturalText) {
  const key = process.env.CALORIE_NINJAS_KEY;
  if (key) {
    try {
      const url = `https://api.calorieninjas.com/v1/nutrition?query=${encodeURIComponent(naturalText)}`;
      const r = await fetch(url, {
        headers: { 'X-Api-Key': key, ...UA },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!r.ok) throw new Error(`CalorieNinjas HTTP ${r.status}`);
      const data = await r.json();
      return { source: 'calorie_ninjas', items: data.items || [] };
    } catch (err) {
      // fall through to OFF
    }
  }
  // Fallback OFF: ya no es NL parsing real (cantidad parsing) pero da catálogo
  // de productos con nutrition_per_100g. El front puede mostrar al usuario
  // y dejarlo seleccionar uno + multiplicar por gramos.
  try {
    const off = require('./openfoodfacts');
    const result = await off.searchFood(naturalText, { pageSize: 5 });
    return {
      source: 'open_food_facts',
      query: naturalText,
      results: result.results || [],
      note: 'OFF fallback — products with nutrition_per_100g, multiplica por tu cantidad real',
    };
  } catch (err) {
    return { source: 'parse_nutrition', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  STUBS — wearable OAuth pollers (Fitbit / Oura / Withings)
//  La aprox. simple es: usuario configura la integración una vez,
//  guarda access_token + refresh_token en wearable_credentials,
//  y este poller llama a las APIs correspondientes.
// ════════════════════════════════════════════════════════════
async function ensureWearableCreds() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS wearable_credentials (
       id SERIAL PRIMARY KEY,
       provider TEXT NOT NULL UNIQUE,
       access_token TEXT,
       refresh_token TEXT,
       expires_at TIMESTAMPTZ,
       scope TEXT,
       user_id TEXT,
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
}

async function fetchFitbitDaily() {
  await ensureWearableCreds();
  const cred = await db.queryOne(`SELECT * FROM wearable_credentials WHERE provider='fitbit'`);
  const clientId = process.env.FITBIT_CLIENT_ID;
  if (!clientId) return { source: 'fitbit', skipped: 'FITBIT_CLIENT_ID no configurado' };
  if (!cred?.access_token) return { source: 'fitbit', skipped: 'OAuth no completado — visita /api/wearable/fitbit/auth' };
  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://api.fitbit.com/1/user/-/activities/date/${today}.json`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${cred.access_token}` },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (r.status === 401) return { source: 'fitbit', error: 'access_token expirado, refresh necesario' };
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const summary = data.summary || {};
    // Insert as wearable_raw → existing aggregator picks it up
    await db.query(
      `INSERT INTO bio_wearable_raw (device_id, device_type, metric_type, value_numeric, unit, measured_at, raw)
       VALUES ('fitbit_main', 'fitbit', 'steps', $1, 'count', NOW(), $2),
              ('fitbit_main', 'fitbit', 'calories_burned', $3, 'kcal', NOW(), $2),
              ('fitbit_main', 'fitbit', 'distance', $4, 'km', NOW(), $2)`,
      [summary.steps || 0, JSON.stringify(summary), summary.caloriesOut || 0, summary.distances?.[0]?.distance || 0]
    );
    return { source: 'fitbit', steps: summary.steps, calories: summary.caloriesOut };
  } catch (err) {
    return { source: 'fitbit', error: err.message };
  }
}

async function fetchOuraDaily() {
  const key = process.env.OURA_PERSONAL_TOKEN;
  if (!key) return { source: 'oura', skipped: 'OURA_PERSONAL_TOKEN no configurado (settings.ouraring.com → Personal Access Tokens)' };
  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${today}&end_date=${today}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items = data.data || [];
    for (const it of items) {
      await db.query(
        `INSERT INTO bio_wearable_raw (device_id, device_type, metric_type, value_numeric, unit, measured_at, raw)
         VALUES ('oura_ring', 'oura', 'readiness_score', $1, 'score', $2, $3)`,
        [it.score, it.day, JSON.stringify(it)]
      );
    }
    return { source: 'oura', readings: items.length };
  } catch (err) {
    return { source: 'oura', error: err.message };
  }
}

async function fetchWithingsDaily() {
  await ensureWearableCreds();
  const cred = await db.queryOne(`SELECT * FROM wearable_credentials WHERE provider='withings'`);
  const clientId = process.env.WITHINGS_CLIENT_ID;
  if (!clientId) return { source: 'withings', skipped: 'WITHINGS_CLIENT_ID no configurado' };
  if (!cred?.access_token) return { source: 'withings', skipped: 'OAuth no completado' };
  try {
    const url = 'https://wbsapi.withings.net/measure?action=getmeas&meastype=1';
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${cred.access_token}` },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return { source: 'withings', body: data.body };
  } catch (err) {
    return { source: 'withings', error: err.message };
  }
}

module.exports = {
  searchUSDAFood,
  fetchOpenUV,
  parseNutrition,
  fetchFitbitDaily,
  fetchOuraDaily,
  fetchWithingsDaily,
  ensureWearableCreds,
};
