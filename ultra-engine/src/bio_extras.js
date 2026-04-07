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
async function fetchOpenUV({ lat = -36.85, lon = 174.76 } = {}) {
  const key = process.env.OPENUV_API_KEY;
  if (!key) return { source: 'openuv', skipped: 'OPENUV_API_KEY no configurada' };
  try {
    const url = `https://api.openuv.io/api/v1/uv?lat=${lat}&lng=${lon}`;
    const r = await fetch(url, {
      headers: { 'x-access-token': key, ...UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`OpenUV HTTP ${r.status}`);
    const data = await r.json();
    const result = data.result || {};
    // Persist to bio_environmental table (create on demand)
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
    await db.query(
      `INSERT INTO bio_environmental (source, metric, value, unit, latitude, longitude, measured_at, payload)
       VALUES ('openuv', 'uv_index', $1, 'index', $2, $3, $4, $5)`,
      [result.uv, lat, lon, result.uv_time || new Date(), JSON.stringify(result)]
    );
    return { source: 'openuv', uv: result.uv, max: result.uv_max, sun_info: result.sun_info };
  } catch (err) {
    return { source: 'openuv', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  CalorieNinjas — natural-language nutrition parsing
//  Docs: https://calorieninjas.com/api
// ════════════════════════════════════════════════════════════
async function parseNutrition(naturalText) {
  const key = process.env.CALORIE_NINJAS_KEY;
  if (!key) return { skipped: 'CALORIE_NINJAS_KEY no configurada' };
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
    return { source: 'calorie_ninjas', error: err.message };
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
