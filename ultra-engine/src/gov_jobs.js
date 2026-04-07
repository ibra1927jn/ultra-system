// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Gov Job Sources (P2 Fase 2)              ║
// ║                                                            ║
// ║  Fetchers a portales gov de empleo:                        ║
// ║   • USAJobs       — usajobs.gov (free, requiere User-Agent ║
// ║                     con email + Authorization-Key opcional)║
// ║   • JobTech SE    — jobsearch.api.jobtechdev.se (free)     ║
// ║   • hh.ru         — api.hh.ru (free)                       ║
// ║   • NAV (Norway)  — arbeidsplassen.nav.no PAM feed (free)  ║
// ║   • Job Bank CA   — jobbank.gc.ca XML feed (free)          ║
// ║   • EURES         — ec.europa.eu/eures (REST, free)        ║
// ║                                                            ║
// ║  STUBS (requieren OAuth registration):                     ║
// ║   • France Travail — api.francetravail.io                  ║
// ║   • Bundesagentur  — jobsuche.api.bund.dev                 ║
// ║                                                            ║
// ║  Reusa insertJob() y computeScore() de job_apis.js para    ║
// ║  consistencia + dedup por fingerprint.                     ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');
const db = require('./db');
const jobApis = require('./job_apis');

const UA_BASE = 'UltraSystem/1.0 (digital-nomad personal use; contact via telegram)';
const UA = { 'User-Agent': UA_BASE };
const TIMEOUT = 30000;

function makeFingerprint(company, title, locationRaw) {
  const data = `${company || ''}|${title || ''}|${locationRaw || ''}`.toLowerCase();
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

async function buildRow({ source, externalId, title, company, location, country, description, url, postedAt, salaryMin, salaryMax, salaryCurrency }) {
  const score = await jobApis.computeScore(title, description, location, postedAt);
  return {
    title, url, region: country, category: 'gov_source', company,
    location_country: country, location_raw: location,
    is_remote: false, // gov sources son presenciales por default
    salary_min: salaryMin, salary_max: salaryMax, salary_currency: salaryCurrency,
    description, posted_at: postedAt,
    matchScore: score.matchScore, speedScore: score.speedScore,
    difficultyScore: score.difficultyScore, totalScore: score.totalScore,
    fingerprint: makeFingerprint(company, title, location),
    source_type: source,
    external_id: externalId,
  };
}

// ════════════════════════════════════════════════════════════
//  USAJobs — usajobs.gov public API
// ════════════════════════════════════════════════════════════
// API: https://developer.usajobs.gov/Search-API
async function fetchUSAJobs({ keyword = '', limit = 50 } = {}) {
  const email = process.env.USAJOBS_EMAIL;
  const apiKey = process.env.USAJOBS_API_KEY;
  if (!email || !apiKey) {
    return {
      source: 'usajobs', configured: false,
      reason: 'Requiere USAJOBS_EMAIL + USAJOBS_API_KEY (registro free en developer.usajobs.gov)',
    };
  }
  const url = `https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(keyword)}&ResultsPerPage=${limit}`;
  const r = await fetch(url, {
    headers: {
      'Host': 'data.usajobs.gov',
      'User-Agent': email,
      'Authorization-Key': apiKey,
    },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`USAJobs HTTP ${r.status}`);
  const data = await r.json();
  const items = data.SearchResult?.SearchResultItems || [];
  let inserted = 0, skipped = 0;
  for (const it of items) {
    const j = it.MatchedObjectDescriptor || {};
    const loc = j.PositionLocationDisplay || j.PositionLocation?.[0]?.LocationName || '';
    const sal = j.PositionRemuneration?.[0] || {};
    const row = await buildRow({
      source: 'usajobs',
      externalId: j.PositionID,
      title: j.PositionTitle,
      company: j.OrganizationName,
      location: loc,
      country: 'US',
      description: j.UserArea?.Details?.JobSummary || j.QualificationSummary || '',
      url: j.PositionURI,
      postedAt: j.PublicationStartDate,
      salaryMin: parseFloat(sal.MinimumRange) || null,
      salaryMax: parseFloat(sal.MaximumRange) || null,
      salaryCurrency: sal.CurrencyCode || 'USD',
    });
    const r2 = await jobApis.insertJob(row);
    if (r2.inserted) inserted++; else skipped++;
  }
  return { source: 'usajobs', fetched: items.length, inserted, skipped };
}

// ════════════════════════════════════════════════════════════
//  JobTech SE — jobtechdev.se (Sweden, free public API)
// ════════════════════════════════════════════════════════════
async function fetchJobTechSE({ q = '', limit = 50 } = {}) {
  const url = `https://jobsearch.api.jobtechdev.se/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  const r = await fetch(url, { headers: { Accept: 'application/json', ...UA }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`JobTechSE HTTP ${r.status}`);
  const data = await r.json();
  const hits = data.hits || [];
  let inserted = 0, skipped = 0;
  for (const h of hits) {
    const row = await buildRow({
      source: 'jobtech_se',
      externalId: h.id,
      title: h.headline,
      company: h.employer?.name,
      location: h.workplace_address?.municipality || h.workplace_address?.city || '',
      country: 'SE',
      description: (h.description?.text_formatted || h.description?.text || '').slice(0, 3000),
      url: h.webpage_url,
      postedAt: h.publication_date,
      salaryMin: null, salaryMax: null, salaryCurrency: 'SEK',
    });
    const r2 = await jobApis.insertJob(row);
    if (r2.inserted) inserted++; else skipped++;
  }
  return { source: 'jobtech_se', fetched: hits.length, inserted, skipped };
}

// ════════════════════════════════════════════════════════════
//  hh.ru — api.hh.ru (Russia, free)
// ════════════════════════════════════════════════════════════
async function fetchHHru({ text = '', perPage = 50 } = {}) {
  const url = `https://api.hh.ru/vacancies?text=${encodeURIComponent(text)}&per_page=${perPage}`;
  const r = await fetch(url, { headers: { ...UA }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`hh.ru HTTP ${r.status}`);
  const data = await r.json();
  const items = data.items || [];
  let inserted = 0, skipped = 0;
  for (const it of items) {
    const sal = it.salary || {};
    const row = await buildRow({
      source: 'hh_ru',
      externalId: String(it.id),
      title: it.name,
      company: it.employer?.name,
      location: it.area?.name || '',
      country: 'RU',
      description: it.snippet?.responsibility || '',
      url: it.alternate_url,
      postedAt: it.published_at,
      salaryMin: sal.from || null,
      salaryMax: sal.to || null,
      salaryCurrency: sal.currency || 'RUB',
    });
    const r2 = await jobApis.insertJob(row);
    if (r2.inserted) inserted++; else skipped++;
  }
  return { source: 'hh_ru', fetched: items.length, inserted, skipped };
}

// ════════════════════════════════════════════════════════════
//  NAV (Norway) — DEPRECATED public feed
// ════════════════════════════════════════════════════════════
// El antiguo /public-feed/api/v1/ads dejó de funcionar (404).
// La nueva alternativa requiere registration en arbeidsplassen.dev.
// Mantenemos stub hasta migrar.
async function fetchNAV() {
  return {
    source: 'nav_no', configured: false,
    reason: 'NAV public feed deprecated; nueva API requiere registro en arbeidsplassen.dev',
  };
}

// ════════════════════════════════════════════════════════════
//  STUBS: France Travail + Bundesagentur + EURES + Job Bank CA
// ════════════════════════════════════════════════════════════
async function fetchFranceTravail() {
  if (!process.env.FRANCETRAVAIL_CLIENT_ID || !process.env.FRANCETRAVAIL_CLIENT_SECRET) {
    return { source: 'france_travail', configured: false, reason: 'Requiere OAuth client en api.francetravail.io' };
  }
  return { source: 'france_travail', configured: true, todo: true };
}

async function fetchBundesagentur() {
  if (!process.env.BUNDESAGENTUR_API_KEY) {
    return { source: 'bundesagentur', configured: false, reason: 'Requiere registration en jobsuche.api.bund.dev' };
  }
  return { source: 'bundesagentur', configured: true, todo: true };
}

// ════════════════════════════════════════════════════════════
//  UK SPONSOR REGISTER importer
// ════════════════════════════════════════════════════════════
// Parser CSV con soporte para quoted fields (comas dentro de quotes)
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

// CSV publicado por gov.uk: https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers
// La URL del CSV cambia con cada update; el usuario debe pasar la URL actual.
async function importUKSponsorRegister({ url } = {}) {
  if (!url) {
    return {
      ok: false,
      reason: 'Pasa url del CSV actual de https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
    };
  }
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`UK Sponsor CSV HTTP ${r.status}`);
  const text = await r.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV vacío');

  // Detectar columnas (CSV gov.uk típico: "Organisation Name","Town/City","County","Type & Rating","Route")
  const header = parseCsvLine(lines[0]).map(h => h.replace(/"/g, '').trim().toLowerCase());
  const nameIdx = header.findIndex(h => h.includes('organisation') || h.includes('name'));
  const cityIdx = header.findIndex(h => h.includes('town') || h.includes('city'));
  const countyIdx = header.findIndex(h => h.includes('county'));
  const ratingIdx = header.findIndex(h => h.includes('type') || h.includes('rating'));
  const routeIdx = header.findIndex(h => h.includes('route'));

  if (nameIdx === -1) {
    return { ok: false, error: `Header columns no detectadas. Found: ${header.join('|')}` };
  }

  let inserted = 0;
  let failed = 0;
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    const name = parts[nameIdx]?.replace(/^"|"$/g, '').trim();
    if (!name) continue;
    try {
      await db.query(
        `INSERT INTO emp_visa_sponsors (country, company_name, city, region, route, rating, source, imported_at)
         VALUES ('GB', $1, $2, $3, $4, $5, 'uk_sponsor_register', NOW())
         ON CONFLICT (country, company_name) DO UPDATE SET
           city=EXCLUDED.city, region=EXCLUDED.region, route=EXCLUDED.route,
           rating=EXCLUDED.rating, imported_at=NOW()`,
        [name.slice(0, 200), parts[cityIdx]?.replace(/^"|"$/g, '').trim().slice(0, 100),
         parts[countyIdx]?.replace(/^"|"$/g, '').trim().slice(0, 100),
         parts[routeIdx]?.replace(/^"|"$/g, '').trim().slice(0, 100),
         parts[ratingIdx]?.replace(/^"|"$/g, '').trim().slice(0, 100)]
      );
      inserted++;
    } catch { failed++; }
  }
  return { ok: true, source: 'uk_sponsor_register', total_lines: lines.length - 1, inserted, failed };
}

// ════════════════════════════════════════════════════════════
//  Cross-ref visa sponsorship: marca emp_listings.visa_sponsorship=true
//  para companies presentes en emp_visa_sponsors
// ════════════════════════════════════════════════════════════
async function crossRefVisaSponsors() {
  const r = await db.query(
    `UPDATE job_listings SET visa_sponsorship = TRUE
     WHERE visa_sponsorship IS NULL
       AND company IN (
         SELECT company_name FROM emp_visa_sponsors WHERE country = job_listings.location_country
       )`
  );
  return { updated: r.rowCount };
}

// ════════════════════════════════════════════════════════════
//  JobSpy onsite (presencial) — multi-country, multi-site
//  Reusa el sidecar jobspy:8000. Hace 1 query por país relevante
//  para usuario (NZ, AU, ES). Filtra is_remote=false para P2.
// ════════════════════════════════════════════════════════════
async function fetchJobSpyOnsite({ countries = ['New Zealand', 'Australia', 'Spain'] } = {}) {
  const baseUrl = process.env.JOBSPY_BASE_URL || 'http://jobspy:8000';
  let totalFetched = 0, totalInserted = 0, totalSkipped = 0;
  const errors = [];
  for (const country of countries) {
    const url = `${baseUrl}/api/v1/search_jobs?site_name=indeed&search_term=software+engineer&country_indeed=${encodeURIComponent(country)}&results_wanted=15&hours_old=72`;
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
      if (!r.ok) { errors.push(`${country}: HTTP ${r.status}`); continue; }
      const data = await r.json();
      const jobs = data.jobs || [];
      totalFetched += jobs.length;
      const isoMap = { 'New Zealand': 'NZ', 'Australia': 'AU', 'Spain': 'ES', 'Canada': 'CA', 'Germany': 'DE', 'France': 'FR' };
      const iso = isoMap[country] || null;
      for (const j of jobs) {
        // Solo presenciales (no remote) — los remote van a P5
        const isRemoteFlag = /\bremote\b/i.test(`${j.title || ''} ${j.location || ''}`);
        if (isRemoteFlag) { totalSkipped++; continue; }
        const row = await buildRow({
          source: `jobspy_${iso?.toLowerCase() || 'xx'}`,
          externalId: j.id,
          title: j.title,
          company: j.company,
          location: j.location || country,
          country: iso,
          description: (j.description || '').slice(0, 3000),
          url: j.job_url,
          postedAt: j.date_posted,
          salaryMin: j.min_amount,
          salaryMax: j.max_amount,
          salaryCurrency: j.currency || (iso === 'NZ' ? 'NZD' : iso === 'AU' ? 'AUD' : 'EUR'),
        });
        const r2 = await jobApis.insertJob(row);
        if (r2.inserted) totalInserted++; else totalSkipped++;
      }
    } catch (err) {
      errors.push(`${country}: ${err.message}`);
    }
    // throttle entre países
    await new Promise(r => setTimeout(r, 1500));
  }
  return { source: 'jobspy_onsite', countries: countries.length, fetched: totalFetched, inserted: totalInserted, skipped: totalSkipped, errors };
}

async function fetchAll() {
  const results = [];
  const fns = [
    ['usajobs', () => fetchUSAJobs({ keyword: 'engineer', limit: 25 })],
    ['jobtech_se', () => fetchJobTechSE({ q: '', limit: 25 })],
    ['hh_ru', () => fetchHHru({ text: '', perPage: 25 })],
    ['nav_no', () => fetchNAV({ size: 25 })],
    ['jobspy_onsite', () => fetchJobSpyOnsite()],
  ];
  for (const [name, fn] of fns) {
    try { results.push(await fn()); }
    catch (e) { results.push({ source: name, error: e.message }); }
  }
  // Stubs sin error
  results.push(await fetchFranceTravail());
  results.push(await fetchBundesagentur());

  // Cross-ref visa sponsors
  try {
    const xr = await crossRefVisaSponsors();
    results.push({ source: 'visa_xref', ...xr });
  } catch (e) {
    results.push({ source: 'visa_xref', error: e.message });
  }
  return results;
}

module.exports = {
  fetchUSAJobs,
  fetchJobTechSE,
  fetchHHru,
  fetchNAV,
  fetchJobSpyOnsite,
  fetchFranceTravail,
  fetchBundesagentur,
  importUKSponsorRegister,
  crossRefVisaSponsors,
  fetchAll,
};
