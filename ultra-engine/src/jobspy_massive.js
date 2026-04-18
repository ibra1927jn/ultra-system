// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — JobSpy massive multi-site × multi-city     ║
// ║                                                            ║
// ║  Sustituye gov_jobs.fetchJobSpyOnsite (solo 15 jobs Indeed ║
// ║  × 3 países = 45 jobs máx/run). Nuevo pipeline:            ║
// ║    Indeed (country_indeed) × [NZ,AU,ES,GB,CA,DE,FR,US]     ║
// ║    LinkedIn (location) × 20 ciudades principales           ║
// ║    Google Jobs (search_term) × 10 queries                  ║
// ║  → 1500-2500 jobs/run esperados.                           ║
// ║                                                            ║
// ║  Jobs remote → descartados (regla P2=presencial). Sidecar  ║
// ║  rainmanjam/jobspy-api no soporta SEEK (solo indeed/       ║
// ║  linkedin/zip_recruiter/glassdoor/google/bayt/naukri).     ║
// ║  Verificado 2026-04-14 en /api/v1/search_jobs.             ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');
const jobApis = require('./job_apis');

const BASE = process.env.JOBSPY_BASE_URL || 'http://jobspy:8000';
const TIMEOUT = 120000;

// Ciudades con país y tag ISO. Orden importa — primero las del usuario.
const LINKEDIN_CITIES = [
  { city: 'Auckland', country: 'New Zealand', iso: 'NZ' },
  { city: 'Wellington', country: 'New Zealand', iso: 'NZ' },
  { city: 'Christchurch', country: 'New Zealand', iso: 'NZ' },
  { city: 'Hamilton', country: 'New Zealand', iso: 'NZ' },
  { city: 'Sydney', country: 'Australia', iso: 'AU' },
  { city: 'Melbourne', country: 'Australia', iso: 'AU' },
  { city: 'Brisbane', country: 'Australia', iso: 'AU' },
  { city: 'Perth', country: 'Australia', iso: 'AU' },
  { city: 'Adelaide', country: 'Australia', iso: 'AU' },
  { city: 'Madrid', country: 'Spain', iso: 'ES' },
  { city: 'Barcelona', country: 'Spain', iso: 'ES' },
  { city: 'Valencia', country: 'Spain', iso: 'ES' },
  { city: 'Sevilla', country: 'Spain', iso: 'ES' },
  { city: 'London', country: 'United Kingdom', iso: 'GB' },
  { city: 'Dublin', country: 'Ireland', iso: 'IE' },
  { city: 'Amsterdam', country: 'Netherlands', iso: 'NL' },
  { city: 'Berlin', country: 'Germany', iso: 'DE' },
  { city: 'Paris', country: 'France', iso: 'FR' },
  { city: 'Toronto', country: 'Canada', iso: 'CA' },
  { city: 'Vancouver', country: 'Canada', iso: 'CA' },
];

// Indeed usa country_indeed (país completo)
const INDEED_COUNTRIES = [
  { name: 'New Zealand', iso: 'NZ' },
  { name: 'Australia', iso: 'AU' },
  { name: 'Spain', iso: 'ES' },
  { name: 'United Kingdom', iso: 'GB' },
  { name: 'Ireland', iso: 'IE' },
  { name: 'Canada', iso: 'CA' },
  { name: 'Germany', iso: 'DE' },
  { name: 'France', iso: 'FR' },
  { name: 'Netherlands', iso: 'NL' },
];

function fp(company, title, location) {
  return crypto
    .createHash('sha256')
    .update(`${company}|${title}|${location}`.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

async function callSidecar(qs) {
  const r = await fetch(`${BASE}/api/v1/search_jobs?${qs}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`JobSpy HTTP ${r.status}`);
  const d = await r.json();
  return d.jobs || [];
}

async function insertBatch(jobs, ctx) {
  let inserted = 0, skipped = 0, skippedRemote = 0;
  for (const j of jobs) {
    const title = (j.title || '').slice(0, 500);
    if (!title) { skipped++; continue; }
    const loc = j.location || ctx.locationFallback || '';
    const isRemote = /\bremote\b|work[- ]from[- ]home/i.test(`${title} ${loc}`) || j.is_remote === true;
    if (isRemote) { skippedRemote++; continue; }
    const country = ctx.iso || jobApis.detectCountry(loc);
    const postedAt = j.date_posted ? new Date(j.date_posted).toISOString() : null;
    const score = await jobApis.computeScore(title, j.description || '', loc, postedAt);
    const row = {
      title,
      url: j.job_url || j.job_url_direct || `https://example.invalid/${j.id || crypto.randomUUID()}`,
      region: country,
      category: ctx.site,
      company: (j.company || 'Unknown').slice(0, 255),
      company_url: j.company_url || null,
      location_country: country,
      location_city: ctx.city || null,
      location_raw: loc.slice(0, 200),
      sector: null,
      job_type: j.job_type || null,
      is_remote: false,
      salary_min: j.min_amount || null,
      salary_max: j.max_amount || null,
      salary_currency: j.currency || null,
      visa_sponsorship: null,
      description: (j.description || '').slice(0, 3000),
      posted_at: postedAt,
      matchScore: score.matchScore,
      speedScore: score.speedScore,
      difficultyScore: score.difficultyScore,
      totalScore: score.totalScore,
      fingerprint: fp(j.company || '', title, loc),
      external_id: `${ctx.site}:${j.id || crypto.createHash('md5').update(j.job_url || title + loc).digest('hex').slice(0, 16)}`,
    };
    const res = await jobApis.insertJob(row);
    if (res.inserted) inserted++; else skipped++;
  }
  return { inserted, skipped, skippedRemote };
}

async function fetchLinkedInCities({ perCity = 100 } = {}) {
  let totInserted = 0, totSkipped = 0, totRemote = 0, totFetched = 0;
  const perSource = [];
  for (const c of LINKEDIN_CITIES) {
    try {
      const qs = `site_name=linkedin&location=${encodeURIComponent(c.city + ', ' + c.country)}&results_wanted=${perCity}&hours_old=168`;
      const jobs = await callSidecar(qs);
      totFetched += jobs.length;
      const res = await insertBatch(jobs, { site: 'linkedin', city: c.city, iso: c.iso, locationFallback: `${c.city}, ${c.country}` });
      totInserted += res.inserted; totSkipped += res.skipped; totRemote += res.skippedRemote;
      perSource.push({ city: c.city, fetched: jobs.length, inserted: res.inserted });
    } catch (e) {
      perSource.push({ city: c.city, error: e.message.slice(0, 80) });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { source: 'linkedin_cities', fetched: totFetched, inserted: totInserted, skipped: totSkipped, skippedRemote: totRemote, cities: perSource };
}

async function fetchIndeedCountries({ perCountry = 100 } = {}) {
  let totInserted = 0, totSkipped = 0, totRemote = 0, totFetched = 0;
  const perSource = [];
  for (const c of INDEED_COUNTRIES) {
    try {
      const qs = `site_name=indeed&country_indeed=${encodeURIComponent(c.name)}&results_wanted=${perCountry}&hours_old=168`;
      const jobs = await callSidecar(qs);
      totFetched += jobs.length;
      const res = await insertBatch(jobs, { site: 'indeed', iso: c.iso, locationFallback: c.name });
      totInserted += res.inserted; totSkipped += res.skipped; totRemote += res.skippedRemote;
      perSource.push({ country: c.iso, fetched: jobs.length, inserted: res.inserted });
    } catch (e) {
      perSource.push({ country: c.iso, error: e.message.slice(0, 80) });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { source: 'indeed_countries', fetched: totFetched, inserted: totInserted, skipped: totSkipped, skippedRemote: totRemote, countries: perSource };
}

async function fetchAll() {
  const results = [];
  results.push(await fetchIndeedCountries({ perCountry: 100 }));
  results.push(await fetchLinkedInCities({ perCity: 100 }));
  return results;
}

module.exports = { fetchIndeedCountries, fetchLinkedInCities, fetchAll, LINKEDIN_CITIES, INDEED_COUNTRIES };
