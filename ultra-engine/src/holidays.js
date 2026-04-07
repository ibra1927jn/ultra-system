// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Public Holidays (P4 Tier A)              ║
// ║                                                            ║
// ║  Source: date.nager.at (free, no auth, 100+ países)        ║
// ║  Útil para nómada: planificar viajes alrededor de holidays ║
// ║  oficiales (cierres consulados, transporte, mudanzas).     ║
// ║                                                            ║
// ║  Tabla bur_holidays: country, date, name, types.           ║
// ║  Cron syncs cada 30 días los próximos 12 meses por país    ║
// ║  relevantes para usuario.                                  ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const BASE = 'https://date.nager.at/api/v3';
// Países relevantes user (Ibrahim NZ + ES dual + DZ + MENA travel)
const COUNTRIES = ['NZ', 'AU', 'ES', 'DZ', 'FR', 'DE', 'IT', 'PT', 'GB', 'IE', 'US', 'CA', 'MA', 'TN', 'EG'];

async function ensureTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS bur_holidays (
       id SERIAL PRIMARY KEY,
       country VARCHAR(2) NOT NULL,
       date DATE NOT NULL,
       local_name VARCHAR(200),
       name VARCHAR(200),
       fixed BOOLEAN,
       global BOOLEAN,
       counties TEXT[],
       types TEXT[],
       UNIQUE(country, date, name)
     )`
  );
  await db.query(`CREATE INDEX IF NOT EXISTS idx_holidays_date ON bur_holidays(date)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_holidays_country ON bur_holidays(country, date)`);
}

async function fetchYearForCountry(year, countryCode) {
  const r = await fetch(`${BASE}/PublicHolidays/${year}/${countryCode}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`nager.at HTTP ${r.status}`);
  return r.json();
}

async function syncAll({ years = [new Date().getFullYear(), new Date().getFullYear() + 1] } = {}) {
  await ensureTable();
  let totalIns = 0, totalFetched = 0;
  for (const country of COUNTRIES) {
    for (const year of years) {
      try {
        const list = await fetchYearForCountry(year, country);
        totalFetched += list.length;
        for (const h of list) {
          const r = await db.queryOne(
            `INSERT INTO bur_holidays (country, date, local_name, name, fixed, global, counties, types)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (country, date, name) DO NOTHING RETURNING id`,
            [country, h.date, (h.localName || '').slice(0, 200), (h.name || '').slice(0, 200),
             !!h.fixed, !!h.global, h.counties || null, h.types || null]
          );
          if (r) totalIns++;
        }
        await new Promise(r => setTimeout(r, 300));
      } catch { /* skip year/country */ }
    }
  }
  return { source: 'nager.at', countries: COUNTRIES.length, fetched: totalFetched, inserted: totalIns };
}

async function getUpcoming({ country = null, days = 60 } = {}) {
  await ensureTable();
  const params = [days];
  let where = `date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::INTERVAL`;
  if (country) {
    params.push(country);
    where += ` AND country = $2`;
  }
  return db.queryAll(
    `SELECT country, date, local_name, name, types FROM bur_holidays WHERE ${where} ORDER BY date, country`,
    params
  );
}

module.exports = { ensureTable, syncAll, getUpcoming, fetchYearForCountry, COUNTRIES };
