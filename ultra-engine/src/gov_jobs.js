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
// France Travail (ex-Pôle Emploi) — OAuth client_credentials + Offres d'emploi v2.
// Token endpoint: entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire
// API: api.francetravail.io/partenaire/offresdemploi/v2/offres/search
let _ftTokenCache = { token: null, expiresAt: 0 };

async function _getFranceTravailToken() {
  const now = Date.now();
  if (_ftTokenCache.token && _ftTokenCache.expiresAt > now + 60000) {
    return _ftTokenCache.token;
  }
  const id = process.env.FRANCE_TRAVAIL_CLIENT_ID;
  const secret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('FRANCE_TRAVAIL_CLIENT_ID/SECRET no configurados');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
    scope: 'api_offresdemploiv2 o2dsoffre',
  });
  const r = await fetch(
    'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(20000),
    }
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`France Travail oauth ${r.status}: ${txt.slice(0, 300)}`);
  }
  const j = await r.json();
  if (!j.access_token) throw new Error('France Travail oauth: no access_token');
  _ftTokenCache = { token: j.access_token, expiresAt: now + ((j.expires_in || 1500) * 1000) };
  return j.access_token;
}

async function fetchFranceTravail({ keyword = '', range = '0-49' } = {}) {
  if (!process.env.FRANCE_TRAVAIL_CLIENT_ID || !process.env.FRANCE_TRAVAIL_CLIENT_SECRET) {
    return { source: 'france_travail', configured: false, reason: 'Requiere FRANCE_TRAVAIL_CLIENT_ID/SECRET (api.francetravail.io)' };
  }
  try {
    const token = await _getFranceTravailToken();
    const params = new URLSearchParams({ range });
    if (keyword) params.set('motsCles', keyword);
    const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    // 200 = full result, 206 = partial content (rango devuelto). Ambos OK.
    if (r.status !== 200 && r.status !== 206) {
      const txt = await r.text().catch(() => '');
      throw new Error(`France Travail HTTP ${r.status}: ${txt.slice(0, 200)}`);
    }
    const data = await r.json();
    const items = data.resultats || [];
    let inserted = 0, skipped = 0;
    for (const o of items) {
      const title = o.intitule || '';
      const company = o.entreprise?.nom || 'France Travail';
      const location = o.lieuTravail?.libelle || 'France';
      const isRemote = /\b(remote|télétravail|teletravail)\b/i.test(`${title} ${o.description || ''}`);
      if (isRemote) { skipped++; continue; }
      const sal = o.salaire || {};
      const row = await buildRow({
        source: 'france_travail',
        externalId: o.id,
        title,
        company,
        location,
        country: 'FR',
        description: (o.description || '').slice(0, 3000),
        url: o.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`,
        postedAt: o.dateCreation,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: 'EUR',
        // salaire viene como string libre ("Annuel de 30000 a 40000 Euros") — no parseamos
      });
      // adjuntar salaire raw al description si existe
      if (sal.libelle) row.description = `[${sal.libelle}] ${row.description}`;
      const r2 = await jobApis.insertJob(row);
      if (r2.inserted) inserted++; else skipped++;
    }
    return { source: 'france_travail', configured: true, fetched: items.length, inserted, skipped };
  } catch (err) {
    return { source: 'france_travail', configured: true, error: err.message };
  }
}

// Bundesagentur für Arbeit (BA) — German federal employment agency.
// Public API en rest.arbeitsagentur.de/jobboerse/jobsuche-service. El client id
// `jobboerse-jobsuche` es público (no es secreto, está en jobsuche.api.bund.dev),
// y se manda como header X-API-Key. No hay OAuth, no hay signup real.
// Aceptamos BUNDESAGENTUR_CLIENT_ID o BUNDESAGENTUR_API_KEY (legacy) por compat.
async function fetchBundesagentur({ keyword = '', location = '', size = 25 } = {}) {
  const apiKey = process.env.BUNDESAGENTUR_CLIENT_ID || process.env.BUNDESAGENTUR_API_KEY;
  if (!apiKey) {
    return { source: 'bundesagentur', configured: false, reason: 'Requiere BUNDESAGENTUR_CLIENT_ID (public id "jobboerse-jobsuche")' };
  }
  try {
    const params = new URLSearchParams({ size: String(size) });
    if (keyword) params.set('was', keyword);
    if (location) params.set('wo', location);
    const url = `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?${params}`;
    const r = await fetch(url, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json', ...UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`Bundesagentur HTTP ${r.status}: ${txt.slice(0, 200)}`);
    }
    const data = await r.json();
    const items = data.stellenangebote || [];
    let inserted = 0, skipped = 0;
    for (const o of items) {
      const title = o.titel || o.beruf || '';
      const company = o.arbeitgeber || 'Bundesagentur';
      const aort = o.arbeitsort || {};
      const location = [aort.ort, aort.region].filter(Boolean).join(', ') || 'Deutschland';
      const isRemote = /\b(remote|homeoffice|home office|fernarbeit)\b/i.test(`${title}`);
      if (isRemote) { skipped++; continue; }
      const row = await buildRow({
        source: 'bundesagentur',
        externalId: o.refnr,
        title,
        company,
        location,
        country: 'DE',
        description: '', // BA v4 search no devuelve description completa, sólo en /jobdetails/{refnr}
        url: o.externeUrl || `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(o.refnr || '')}`,
        postedAt: o.aktuelleVeroeffentlichungsdatum || o.eintrittsdatum,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: 'EUR',
      });
      const r2 = await jobApis.insertJob(row);
      if (r2.inserted) inserted++; else skipped++;
    }
    return { source: 'bundesagentur', configured: true, fetched: items.length, inserted, skipped };
  } catch (err) {
    return { source: 'bundesagentur', configured: true, error: err.message };
  }
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

// ════════════════════════════════════════════════════════════
//  EURES — European Employment Services public REST API
//  Docs: https://ec.europa.eu/eures/eures-apps/searchengine/
//  Search via: https://ec.europa.eu/eures/eures-searchengine/page/main
//  No-key public endpoint discovered: /jv-se/api/v0/jobs/search
// ════════════════════════════════════════════════════════════
async function fetchEURES({ keyword = '', countries = ['ES', 'FR', 'DE', 'NL'], limit = 50 } = {}) {
  try {
    const url = 'https://ec.europa.eu/eures/eures-searchengine/page/jv-search/search';
    const body = {
      page: 0,
      resultsPerPage: limit,
      sortSearch: 'BEST_MATCH',
      keywordsEverywhere: keyword || '',
      locationCodes: countries,
      occupationCodes: [],
      educationLevels: [],
      sectorCodes: [],
      requiredExperienceCodes: [],
      contractTypeCodes: [],
      workingTimeCodes: [],
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...UA },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`EURES HTTP ${r.status}`);
    const data = await r.json();
    const items = data.jvs || data.results || [];
    let inserted = 0;
    for (const j of items) {
      const title = j.title || j.jobTitle || '';
      const location = j.locationName || j.location?.toString() || '';
      if (/\bremote\b/i.test(`${title} ${location}`)) continue;
      const country = (j.locationCountry || countries[0] || '').toUpperCase().slice(0, 2);
      const row = await buildRow({
        source: 'eures',
        externalId: j.id || j.referenceNumber,
        title,
        company: j.employerName || 'EURES',
        location,
        country,
        description: (j.description || '').slice(0, 3000),
        url: j.url || `https://ec.europa.eu/eures/eures-searchengine/page/jv-details/${j.id}`,
        postedAt: j.publicationStartDate,
        salaryMin: j.salaryFrom, salaryMax: j.salaryTo, salaryCurrency: j.salaryCurrency,
      });
      const res = await jobApis.insertJob(row);
      if (res.inserted) inserted++;
    }
    return { source: 'eures', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'eures', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  Job Bank Canada — XML feed (free, no auth)
//  https://www.jobbank.gc.ca/jobsearch/xmlfeed
// ════════════════════════════════════════════════════════════
async function fetchJobBankCanada({ limit = 50 } = {}) {
  try {
    const Parser = require('rss-parser');
    const p = new Parser({ timeout: TIMEOUT, headers: UA });
    const feed = await p.parseURL('https://www.jobbank.gc.ca/jobsearch/jobsearch?fsrc=21&fage=1&sort=M&fmt=rss');
    const items = (feed.items || []).slice(0, limit);
    let inserted = 0;
    for (const it of items) {
      const title = it.title || '';
      const desc = it.contentSnippet || '';
      // Extract company + location from title format "Title - Company - Location"
      const parts = title.split(/\s+-\s+/);
      const jobTitle = parts[0] || title;
      const company = parts[1] || 'Unknown';
      const location = parts[2] || 'Canada';
      if (/\bremote\b/i.test(`${title} ${desc}`)) continue;
      const row = await buildRow({
        source: 'jobbank_ca',
        externalId: it.guid || it.link,
        title: jobTitle,
        company,
        location,
        country: 'CA',
        description: desc.slice(0, 3000),
        url: it.link,
        postedAt: it.isoDate,
      });
      const res = await jobApis.insertJob(row);
      if (res.inserted) inserted++;
    }
    return { source: 'jobbank_ca', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'jobbank_ca', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  Visa-sponsorship-companies importer (multi-country)
//  Source: github.com/SiaExplains/visa-sponsorship-companies
//  Reescrito 2026-04-07: README estaba vacío (data en /countries/*.json).
//  Usa GitHub Contents API + raw JSON download. Mapea filename → ISO-2.
// ════════════════════════════════════════════════════════════
const COUNTRY_NAME_TO_ISO2 = {
  // Subset relevante para el repo SiaExplains. Soporta lower/upper.
  denmark:'DK', austria:'AT', belgium:'BE', england:'GB', finland:'FI',
  france:'FR', germany:'DE', ireland:'IE', italy:'IT', netherlands:'NL',
  norway:'NO', poland:'PL', portugal:'PT', spain:'ES', sweden:'SE',
  switzerland:'CH', luxembourg:'LU', australia:'AU', 'new zealand':'NZ',
  canada:'CA', 'united states':'US', usa:'US', 'united kingdom':'GB',
  uk:'GB', japan:'JP', singapore:'SG', dubai:'AE', uae:'AE',
  estonia:'EE', latvia:'LV', lithuania:'LT', czechia:'CZ', 'czech republic':'CZ',
  hungary:'HU', romania:'RO', bulgaria:'BG', greece:'GR', cyprus:'CY',
  malta:'MT', slovakia:'SK', slovenia:'SI', croatia:'HR', iceland:'IS',
  scotland:'GB', wales:'GB', 'northern ireland':'GB',
};
function nameToIso2(name) {
  return COUNTRY_NAME_TO_ISO2[name.toLowerCase().trim().replace(/\.json$/, '')] || null;
}

async function importVisaSponsorshipCompanies() {
  try {
    const idx = await fetch(
      'https://api.github.com/repos/SiaExplains/visa-sponsorship-companies/contents/countries',
      { headers: { ...UA, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (!idx.ok) throw new Error(`GH contents HTTP ${idx.status}`);
    const files = await idx.json();
    let inserted = 0, skippedCountries = 0;
    for (const f of files) {
      if (!f.name?.endsWith('.json') || !f.download_url) continue;
      const iso = nameToIso2(f.name.replace(/\.json$/, ''));
      if (!iso) { skippedCountries++; continue; }
      const r = await fetch(f.download_url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
      if (!r.ok) continue;
      let arr;
      try { arr = await r.json(); } catch { continue; }
      if (!Array.isArray(arr)) continue;
      for (const c of arr) {
        const name = (c.name || c.company || '').trim();
        if (!name || name.length < 2) continue;
        const city = (c.city || '').trim().slice(0, 100);
        const industry = (c.industry || '').trim().slice(0, 100);
        try {
          await db.query(
            `INSERT INTO emp_visa_sponsors (country, company_name, city, region, source, imported_at)
             VALUES ($1, $2, $3, $4, 'siaexplains', NOW())
             ON CONFLICT (country, company_name) DO UPDATE SET
               city=EXCLUDED.city, region=EXCLUDED.region, imported_at=NOW()`,
            [iso, name.slice(0, 200), city || null, industry || null]
          );
          inserted++;
        } catch { /* skip dup/error */ }
      }
    }
    return { source: 'siaexplains', files: files.length, inserted, skipped_unknown_country: skippedCountries };
  } catch (err) {
    return { source: 'siaexplains', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  Geshan AU sponsors (github.com/geshan/au-companies-providing-work-visa-sponsorship)
//  README markdown con bullets: "- [Company](url) | Location | Tech stack"
//  Repo en branch master, no main.
// ════════════════════════════════════════════════════════════
async function importGeshanAU() {
  try {
    const r = await fetch(
      'https://raw.githubusercontent.com/geshan/au-companies-providing-work-visa-sponsorship/master/README.md',
      { headers: UA, signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const md = await r.text();
    const lines = md.split('\n');
    let inserted = 0;
    for (const line of lines) {
      const m = line.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]+?)(?:\s*\|\s*(.+))?$/);
      if (!m) continue;
      const name = m[1].trim();
      const location = m[3].trim().slice(0, 100);
      if (!name || name.length < 2) continue;
      try {
        await db.query(
          `INSERT INTO emp_visa_sponsors (country, company_name, city, source, imported_at)
           VALUES ('AU', $1, $2, 'geshan_au_repo', NOW())
           ON CONFLICT (country, company_name) DO UPDATE SET
             city=EXCLUDED.city, imported_at=NOW()`,
          [name.slice(0, 200), location || null]
        );
        inserted++;
      } catch { /* skip */ }
    }
    return { source: 'geshan_au_repo', inserted };
  } catch (err) {
    return { source: 'geshan_au_repo', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  NL IND sponsors (github.com/oussamabouchikhi/companies-sponsoring-visas-netherlands)
//  README markdown table: | Name | Location(s) | Department | Careers page | Bonus |
// ════════════════════════════════════════════════════════════
async function importNLINDSponsors() {
  try {
    const r = await fetch(
      'https://raw.githubusercontent.com/oussamabouchikhi/companies-sponsoring-visas-netherlands/main/README.md',
      { headers: UA, signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const md = await r.text();
    const lines = md.split('\n');
    let inserted = 0;
    for (const line of lines) {
      // skip headers/separators
      if (/^\|\s*[-:|\s]+\|/.test(line)) continue;
      if (/^\|\s*Name\s*\|/i.test(line)) continue;
      const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
      if (!m) continue;
      const name = m[1].trim();
      if (!name || name.length < 2 || /^---/.test(name)) continue;
      const location = m[2].trim().replace(/,?\s*NL\s*$/i, '').slice(0, 100);
      const dept = m[3].trim().slice(0, 100);
      try {
        await db.query(
          `INSERT INTO emp_visa_sponsors (country, company_name, city, region, source, imported_at)
           VALUES ('NL', $1, $2, $3, 'oussama_nl_repo', NOW())
           ON CONFLICT (country, company_name) DO UPDATE SET
             city=EXCLUDED.city, region=EXCLUDED.region, imported_at=NOW()`,
          [name.slice(0, 200), location || null, dept || null]
        );
        inserted++;
      } catch { /* skip */ }
    }
    return { source: 'oussama_nl_repo', inserted };
  } catch (err) {
    return { source: 'oussama_nl_repo', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  Canada LMIA Positive Employers (open.canada.ca CKAN dataset)
//  Auto-discover most recent _en.csv via package_show API.
//  CSV format: skip line 1 (title), header on line 2:
//    Province/Territory, Stream, Employer, Address, Occupation, Approved Positions
// ════════════════════════════════════════════════════════════
async function importCanadaLMIA() {
  try {
    const meta = await fetch(
      'https://open.canada.ca/data/api/3/action/package_show?id=90fed587-1364-4f33-a9ee-208181dc0b97',
      { headers: UA, signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (!meta.ok) throw new Error(`CKAN HTTP ${meta.status}`);
    const data = await meta.json();
    const csvs = (data.result?.resources || []).filter(
      r => (r.format || '').toLowerCase() === 'csv' && (r.url || '').includes('_en')
    );
    if (!csvs.length) throw new Error('no _en CSV resources found');
    csvs.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const latest = csvs[0];
    const csvR = await fetch(latest.url, { headers: UA, signal: AbortSignal.timeout(60000) });
    if (!csvR.ok) throw new Error(`CSV HTTP ${csvR.status}`);
    const text = await csvR.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 3) throw new Error('CSV vacío');
    // Header on line 2 (index 1) — line 1 is the dataset title.
    const header = parseCsvLine(lines[1]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const provIdx = header.findIndex(h => h.includes('province'));
    const employerIdx = header.findIndex(h => h.includes('employer'));
    const addressIdx = header.findIndex(h => h.includes('address'));
    if (employerIdx === -1) throw new Error(`employer col missing: ${header.join('|')}`);
    let inserted = 0;
    for (let i = 2; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      const name = parts[employerIdx]?.replace(/^"|"$/g, '').trim();
      if (!name || name.length < 2) continue;
      const province = parts[provIdx]?.replace(/^"|"$/g, '').trim().slice(0, 100);
      const address = parts[addressIdx]?.replace(/^"|"$/g, '').trim().slice(0, 100);
      try {
        await db.query(
          `INSERT INTO emp_visa_sponsors (country, company_name, city, region, source, imported_at)
           VALUES ('CA', $1, $2, $3, 'canada_lmia', NOW())
           ON CONFLICT (country, company_name) DO UPDATE SET
             city=EXCLUDED.city, region=EXCLUDED.region, imported_at=NOW()`,
          [name.slice(0, 200), address || null, province || null]
        );
        inserted++;
      } catch { /* skip */ }
    }
    return { source: 'canada_lmia', resource: latest.name?.slice(0, 80), inserted };
  } catch (err) {
    return { source: 'canada_lmia', error: err.message };
  }
}

// Aggregate runner para todos los importers de sponsor lists
async function importAllSponsorRepos() {
  const out = [];
  out.push(await importVisaSponsorshipCompanies());
  out.push(await importGeshanAU());
  out.push(await importNLINDSponsors());
  out.push(await importCanadaLMIA());
  // Cross-ref se ejecuta al final para taggear job_listings con visa_sponsorship=true
  try { out.push({ source: 'visa_xref', ...(await crossRefVisaSponsors()) }); }
  catch (e) { out.push({ source: 'visa_xref', error: e.message }); }
  return out;
}

async function fetchAll() {
  const results = [];
  const workday = require('./workday');
  const fns = [
    ['usajobs', () => fetchUSAJobs({ keyword: 'engineer', limit: 25 })],
    ['jobtech_se', () => fetchJobTechSE({ q: '', limit: 25 })],
    ['hh_ru', () => fetchHHru({ text: '', perPage: 25 })],
    ['nav_no', () => fetchNAV({ size: 25 })],
    ['jobspy_onsite', () => fetchJobSpyOnsite()],
    // EURES + Job Bank CA están bloqueados desde IP datacenter Hetzner
    // (Cloudflare/CDN-level block, verificado 2026-04-07). Ver gov_jobs.js docstrings.
    // Permanecen exportados para uso manual desde otra IP cuando haga falta.
    ['workday', async () => {
      const r = await workday.fetchAll();
      const inserted = r.reduce((a, x) => a + (x.inserted || 0), 0);
      const skipped = r.reduce((a, x) => a + (x.skipped || 0), 0);
      return { source: 'workday', tenants: r.length, inserted, skipped, details: r };
    }],
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
  fetchEURES,
  fetchJobBankCanada,
  importVisaSponsorshipCompanies,
  importGeshanAU,
  importNLINDSponsors,
  importCanadaLMIA,
  importAllSponsorRepos,
  importUKSponsorRegister,
  crossRefVisaSponsors,
  fetchAll,
};
