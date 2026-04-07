// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — P7 ✕ P6 destinos outbreak check          ║
// ║                                                            ║
// ║  Cuando P6 logística añade un trip o route con location/  ║
// ║  country, P7 hace cross-check con health_alerts (WHO/CDC/ ║
// ║  ECDC) + events_store (WHO DONS) y bur_vaccinations.      ║
// ║                                                            ║
// ║  Output: { country, health_alerts:[], events:[],          ║
// ║            vaccinations_recommended:[],                    ║
// ║            risk_level: low|medium|high|critical }          ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

// Vacunas recomendadas por país (subset crítico para usuario nómada)
const RECOMMENDED_VACCINES = {
  // SE Asia / tropicales
  ID: ['hepatitis_a', 'typhoid', 'japanese_encephalitis', 'rabies'],
  TH: ['hepatitis_a', 'typhoid', 'japanese_encephalitis'],
  VN: ['hepatitis_a', 'typhoid', 'japanese_encephalitis'],
  PH: ['hepatitis_a', 'typhoid', 'japanese_encephalitis', 'rabies'],
  KH: ['hepatitis_a', 'typhoid', 'japanese_encephalitis', 'rabies', 'malaria_preventive'],
  // Africa
  DZ: ['hepatitis_a', 'typhoid'],
  MA: ['hepatitis_a', 'typhoid'],
  EG: ['hepatitis_a', 'typhoid'],
  TN: ['hepatitis_a'],
  KE: ['yellow_fever', 'hepatitis_a', 'typhoid', 'rabies', 'malaria_preventive'],
  TZ: ['yellow_fever', 'hepatitis_a', 'typhoid', 'malaria_preventive'],
  // South America
  BR: ['yellow_fever', 'hepatitis_a', 'typhoid'],
  PE: ['yellow_fever', 'hepatitis_a', 'typhoid'],
  CO: ['yellow_fever', 'hepatitis_a', 'typhoid'],
  EC: ['yellow_fever', 'hepatitis_a'],
  // Default low-risk
  NZ: [], AU: [], ES: [], FR: [], DE: [], IT: [], GB: [], US: [], CA: [], JP: [], KR: [],
};

async function checkDestination(countryISO) {
  if (!countryISO) return null;
  const country = countryISO.toUpperCase();

  // 1. health_alerts recientes (last 30d) para ese país
  const alerts = await db.queryAll(
    `SELECT id, source, title, disease, published_at, url
     FROM health_alerts
     WHERE country_iso = $1
       AND published_at >= NOW() - INTERVAL '30 days'
     ORDER BY published_at DESC LIMIT 10`,
    [country]
  );

  // 2. events_store de tipo disease_outbreak para el país
  const events = await db.queryAll(
    `SELECT id, source, severity, title, occurred_at, url
     FROM events_store
     WHERE country = $1 AND event_type = 'disease_outbreak'
       AND occurred_at >= NOW() - INTERVAL '60 days'
     ORDER BY occurred_at DESC LIMIT 10`,
    [country]
  );

  // 3. Vacunas recomendadas vs vacunas que tiene el usuario
  const recommended = RECOMMENDED_VACCINES[country] || [];
  const userVaccinations = await db.queryAll(
    `SELECT vaccine, expiry_date, (expiry_date - CURRENT_DATE) AS days_until_expiry
     FROM bur_vaccinations
     WHERE expiry_date IS NULL OR expiry_date > CURRENT_DATE`
  );
  const userVaccinesNorm = userVaccinations.map(v => v.vaccine.toLowerCase().replace(/[^a-z_]/g, '_'));
  const missing = recommended.filter(rec => !userVaccinesNorm.some(uv => uv.includes(rec.split('_')[0])));

  // 4. Risk level inference
  let riskLevel = 'low';
  const criticalEvents = events.filter(e => e.severity === 'critical' || e.severity === 'high');
  if (criticalEvents.length > 0) riskLevel = 'high';
  else if (events.length > 0 || alerts.length > 3) riskLevel = 'medium';
  if (criticalEvents.length >= 3) riskLevel = 'critical';

  return {
    country,
    risk_level: riskLevel,
    health_alerts: alerts,
    events: events,
    vaccinations_recommended: recommended,
    vaccinations_missing: missing,
    user_active_vaccinations: userVaccinations.length,
  };
}

module.exports = { checkDestination, RECOMMENDED_VACCINES };
