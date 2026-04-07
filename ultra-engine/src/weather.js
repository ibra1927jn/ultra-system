// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Open-Meteo Weather (P6)                  ║
// ║  Forecast diario para coordenada (free, no auth)         ║
// ║  Cacheado en log_weather_cache UNIQUE (lat,lon,date)     ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

// WMO weather codes → emoji+texto
const WMO = {
  0: ['☀️', 'Despejado'],
  1: ['🌤️', 'Mayormente despejado'],
  2: ['⛅', 'Parcialmente nublado'],
  3: ['☁️', 'Nublado'],
  45: ['🌫️', 'Niebla'],
  48: ['🌫️', 'Niebla con escarcha'],
  51: ['🌦️', 'Llovizna ligera'],
  53: ['🌦️', 'Llovizna moderada'],
  55: ['🌦️', 'Llovizna densa'],
  61: ['🌧️', 'Lluvia ligera'],
  63: ['🌧️', 'Lluvia moderada'],
  65: ['🌧️', 'Lluvia fuerte'],
  71: ['🌨️', 'Nieve ligera'],
  73: ['🌨️', 'Nieve moderada'],
  75: ['❄️', 'Nieve fuerte'],
  80: ['🌦️', 'Chubascos'],
  81: ['🌧️', 'Chubascos moderados'],
  82: ['⛈️', 'Chubascos violentos'],
  95: ['⛈️', 'Tormenta'],
  96: ['⛈️', 'Tormenta con granizo'],
  99: ['⛈️', 'Tormenta fuerte con granizo'],
};

function decode(code) {
  return WMO[code] || ['🌡️', `Código ${code}`];
}

/**
 * Fetch forecast 7 días para una coordenada.
 * Inserta/actualiza log_weather_cache.
 */
async function fetchForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code',
    timezone: 'auto',
    forecast_days: '7',
  });

  const res = await fetch(`${OPEN_METEO}?${params}`, {
    headers: { 'User-Agent': 'UltraSystem/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();

  const days = data.daily?.time || [];
  let inserted = 0;
  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const tMax = data.daily.temperature_2m_max[i];
    const tMin = data.daily.temperature_2m_min[i];
    const precip = data.daily.precipitation_sum[i];
    const wind = data.daily.wind_speed_10m_max[i];
    const code = data.daily.weather_code[i];
    const [emoji, label] = decode(code);

    await db.query(
      `INSERT INTO log_weather_cache
         (latitude, longitude, date, temp_max, temp_min, precip_mm, wind_kph, weather_code, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (latitude, longitude, date) DO UPDATE SET
         temp_max = EXCLUDED.temp_max,
         temp_min = EXCLUDED.temp_min,
         precip_mm = EXCLUDED.precip_mm,
         wind_kph = EXCLUDED.wind_kph,
         weather_code = EXCLUDED.weather_code,
         summary = EXCLUDED.summary,
         fetched_at = NOW()`,
      [latitude, longitude, date, tMax, tMin, precip, wind, code, `${emoji} ${label}`]
    );
    inserted++;
  }
  return { inserted, days: days.length };
}

/**
 * Lista forecast cacheado para una coordenada (7 días).
 */
async function getForecast(latitude, longitude) {
  // Tolerancia 0.01° (≈1 km) para hits de cache
  return db.queryAll(
    `SELECT date, temp_max, temp_min, precip_mm, wind_kph, weather_code, summary
     FROM log_weather_cache
     WHERE ABS(latitude - $1) < 0.01 AND ABS(longitude - $2) < 0.01
       AND date >= CURRENT_DATE
     ORDER BY date ASC LIMIT 7`,
    [latitude, longitude]
  );
}

/**
 * Helper: obtiene la "current location" del usuario (desde log_locations existente
 * con is_current=TRUE) si existe, o NULL.
 */
async function getCurrentLocation() {
  return db.queryOne(
    `SELECT name, lat AS latitude, lon AS longitude, country
     FROM log_locations WHERE is_current = TRUE
     ORDER BY id DESC LIMIT 1`
  );
}

module.exports = { fetchForecast, getForecast, getCurrentLocation, decode };
