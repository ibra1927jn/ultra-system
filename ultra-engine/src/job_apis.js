// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Job APIs / ATS Fetchers (P2)             ║
// ║                                                          ║
// ║  Decisión 2026-04-07: P2 = presencial, P5 = remoto.      ║
// ║  Aquí poleamos los ATS clásicos (free, no auth) para     ║
// ║  empresas en emp_tracked_companies. Filtramos por        ║
// ║  is_remote y solo guardamos presenciales en job_listings.║
// ║  Las remotas se descartan (las cubre opp_fetchers.js).   ║
// ║                                                          ║
// ║  ATS soportados:                                         ║
// ║   • Greenhouse  → boards-api.greenhouse.io               ║
// ║   • Lever       → api.lever.co                           ║
// ║   • Ashby       → api.ashbyhq.com                        ║
// ║   • SmartRecruiters → api.smartrecruiters.com            ║
// ║                                                          ║
// ║  Scoring weighted: match (50) + speed (25) + difficulty  ║
// ║  (25). Total = sum, max 100.                             ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');
const db = require('./db');

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; UltraSystem/1.0)' };
const TIMEOUT = 20000;

// ─── Detectar si una posición es remota basado en title/location ──
function isRemote(title, locationRaw) {
  const text = `${title || ''} ${locationRaw || ''}`.toLowerCase();
  return /\b(remote|work from home|wfh|distributed|anywhere)\b/.test(text);
}

// ─── Country code detection from location string ──
function detectCountry(locationRaw) {
  if (!locationRaw) return null;
  const l = locationRaw.toLowerCase();
  const map = {
    'new zealand': 'NZ', 'auckland': 'NZ', 'wellington': 'NZ', 'christchurch': 'NZ',
    'australia': 'AU', 'sydney': 'AU', 'melbourne': 'AU', 'brisbane': 'AU', 'perth': 'AU',
    'spain': 'ES', 'madrid': 'ES', 'barcelona': 'ES', 'valencia': 'ES',
    'usa': 'US', 'united states': 'US', ' us': 'US', ' ny': 'US', 'california': 'US',
    'london': 'GB', 'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB',
    'germany': 'DE', 'berlin': 'DE', 'munich': 'DE',
    'france': 'FR', 'paris': 'FR',
    'canada': 'CA', 'toronto': 'CA', 'vancouver': 'CA',
    'singapore': 'SG', 'tokyo': 'JP', 'japan': 'JP',
  };
  for (const [name, iso] of Object.entries(map)) {
    if (l.includes(name)) return iso;
  }
  return null;
}

// ─── Scoring engine: match (50) + speed (25) + difficulty (25) ──
async function computeScore(title, description, location, postedAt) {
  // Match: keyword scoring (reusa rss_keywords)
  const text = `${title || ''} ${description || ''} ${location || ''}`.toLowerCase();
  const kws = await db.queryAll('SELECT keyword, weight FROM rss_keywords');
  let matchRaw = 0;
  for (const k of kws) {
    if (text.includes(k.keyword.toLowerCase())) matchRaw += k.weight;
  }
  // Normalizar a 0-50: cap a 5 keywords matched a 10 = 50 max
  const matchScore = Math.min(50, matchRaw);

  // Speed: cuán reciente (más reciente = mayor speed score)
  let speedScore = 25;
  if (postedAt) {
    const ageDays = (Date.now() - new Date(postedAt).getTime()) / 86400000;
    if (ageDays < 1) speedScore = 25;
    else if (ageDays < 3) speedScore = 20;
    else if (ageDays < 7) speedScore = 15;
    else if (ageDays < 14) speedScore = 10;
    else if (ageDays < 30) speedScore = 5;
    else speedScore = 0;
  }

  // Difficulty: bonus por país relevante (NZ/AU/ES) + visa-friendly markers
  let difficultyScore = 0;
  if (/new zealand|auckland|wellington/i.test(location || '')) difficultyScore += 25;
  else if (/australia|sydney|melbourne/i.test(location || '')) difficultyScore += 20;
  else if (/spain|madrid|barcelona/i.test(location || '')) difficultyScore += 18;
  else if (/visa|sponsor|relocation/i.test(`${title} ${description}`)) difficultyScore += 12;
  else difficultyScore += 5;

  return {
    matchScore,
    speedScore,
    difficultyScore,
    totalScore: matchScore + speedScore + difficultyScore,
  };
}

function makeFingerprint(company, title, locationRaw) {
  const data = `${company || ''}|${title || ''}|${locationRaw || ''}`.toLowerCase();
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// ─── Insert con dedup por fingerprint y url ──
// Hay 2 UNIQUE constraints en job_listings: (fingerprint) y (url). PG solo
// permite mencionar una en ON CONFLICT, así que cubrimos fingerprint en el
// INSERT y atrapamos la violation de URL via try/catch. Sin esto, re-runs
// con URLs estables pero fingerprint cambiado (e.g. cambio de location)
// rompían el batch entero (descubierto 2026-04-08 al re-correr ats-fetch
// para Stripe/Rocket Lab/Cresta).
async function insertJob(row) {
  // CRÍTICO: si is_remote=true, descartar (lo cubre P5/opp_fetchers)
  if (row.is_remote) return { skipped: 'remote' };

  try {
    const r = await db.queryOne(
      `INSERT INTO job_listings
         (title, url, region, category, status, company, company_url,
          location_country, location_city, location_raw, sector, job_type,
          is_remote, salary_min, salary_max, salary_currency, visa_sponsorship,
          description, posted_at, scraped_at,
          match_score, speed_score, difficulty_score, total_score,
          fingerprint, source_type, external_id)
       VALUES ($1, $2, $3, $4, 'new', $5, $6, $7, $8, $9, $10, $11, FALSE,
               $12, $13, $14, $15, $16, $17, NOW(),
               $18, $19, $20, $21, $22, 'api', $23)
       ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL DO UPDATE SET
         scraped_at = NOW(),
         total_score = GREATEST(job_listings.total_score, EXCLUDED.total_score)
       RETURNING (xmax = 0) AS inserted`,
      [
        (row.title || '').substring(0, 500),
        row.url,
        row.region || row.location_country,
        row.category || 'tech',
        row.company,
        row.company_url || null,
        row.location_country || null,
        row.location_city || null,
        (row.location_raw || '').substring(0, 255),
        row.sector || null,
        row.job_type || null,
        row.salary_min || null,
        row.salary_max || null,
        row.salary_currency || null,
        row.visa_sponsorship || null,
        (row.description || '').substring(0, 3000),
        row.posted_at || null,
        row.matchScore, row.speedScore, row.difficultyScore, row.totalScore,
        row.fingerprint,
        row.external_id || null,
      ]
    );
    return r?.inserted ? { inserted: true } : { duplicate: true };
  } catch (err) {
    // job_listings_url_key colisiona cuando URL ya existe pero fingerprint
    // cambió (ej. mismo job re-publicado con location distinta). Tratamos
    // como duplicate normal para no romper el batch.
    if (err.code === '23505' && err.constraint === 'job_listings_url_key') {
      return { duplicate: true };
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
//  GREENHOUSE — boards-api.greenhouse.io/v1/boards/{token}/jobs
// ═══════════════════════════════════════════════════════════
async function fetchGreenhouse(company) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${company.ats_token}/jobs?content=true`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`Greenhouse HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data.jobs || [];

  let inserted = 0, skippedRemote = 0;
  for (const j of jobs) {
    const locationRaw = j.location?.name || '';
    const remote = isRemote(j.title, locationRaw);
    if (remote) { skippedRemote++; continue; }

    const description = (j.content || '').replace(/<[^>]+>/g, '').substring(0, 3000);
    const score = await computeScore(j.title, description, locationRaw, j.updated_at);
    const fp = makeFingerprint(company.name, j.title, locationRaw);

    const r = await insertJob({
      title: j.title,
      url: j.absolute_url,
      company: company.name,
      company_url: `https://boards.greenhouse.io/${company.ats_token}`,
      location_country: detectCountry(locationRaw),
      location_raw: locationRaw,
      sector: company.sector,
      is_remote: false,
      visa_sponsorship: company.visa_sponsor,
      description,
      posted_at: j.updated_at ? new Date(j.updated_at) : null,
      external_id: `gh:${company.ats_token}:${j.id}`,
      fingerprint: fp,
      ...score,
    });
    if (r.inserted) inserted++;
  }
  return { source: 'Greenhouse', company: company.name, total: jobs.length, inserted, skippedRemote };
}

// ═══════════════════════════════════════════════════════════
//  LEVER — api.lever.co/v0/postings/{company}?mode=json
// ═══════════════════════════════════════════════════════════
async function fetchLever(company) {
  const url = `https://api.lever.co/v0/postings/${company.ats_token}?mode=json`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`Lever HTTP ${res.status}`);
  const jobs = await res.json();
  if (!Array.isArray(jobs)) throw new Error('Lever: respuesta inesperada');

  let inserted = 0, skippedRemote = 0;
  for (const j of jobs) {
    const locationRaw = j.categories?.location || '';
    const remote = isRemote(j.text, locationRaw) || j.categories?.commitment === 'Remote';
    if (remote) { skippedRemote++; continue; }

    const description = (j.descriptionPlain || j.description || '').substring(0, 3000);
    const score = await computeScore(j.text, description, locationRaw, j.createdAt);
    const fp = makeFingerprint(company.name, j.text, locationRaw);

    const r = await insertJob({
      title: j.text,
      url: j.hostedUrl || j.applyUrl,
      company: company.name,
      company_url: `https://jobs.lever.co/${company.ats_token}`,
      location_country: detectCountry(locationRaw),
      location_raw: locationRaw,
      sector: company.sector,
      is_remote: false,
      visa_sponsorship: company.visa_sponsor,
      description,
      posted_at: j.createdAt ? new Date(j.createdAt) : null,
      external_id: `lever:${company.ats_token}:${j.id}`,
      fingerprint: fp,
      ...score,
    });
    if (r.inserted) inserted++;
  }
  return { source: 'Lever', company: company.name, total: jobs.length, inserted, skippedRemote };
}

// ═══════════════════════════════════════════════════════════
//  ASHBY — api.ashbyhq.com/posting-api/job-board/{name}
// ═══════════════════════════════════════════════════════════
async function fetchAshby(company) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.ats_token}?includeCompensation=true`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`Ashby HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data.jobs || [];

  let inserted = 0, skippedRemote = 0;
  for (const j of jobs) {
    const locationRaw = j.locationName || '';
    const remote = isRemote(j.title, locationRaw) || j.isRemote === true;
    if (remote) { skippedRemote++; continue; }

    const description = (j.descriptionPlain || j.descriptionHtml || '').replace(/<[^>]+>/g, '').substring(0, 3000);
    const score = await computeScore(j.title, description, locationRaw, j.publishedAt);
    const fp = makeFingerprint(company.name, j.title, locationRaw);

    const r = await insertJob({
      title: j.title,
      url: j.jobUrl,
      company: company.name,
      company_url: `https://jobs.ashbyhq.com/${company.ats_token}`,
      location_country: detectCountry(locationRaw),
      location_raw: locationRaw,
      sector: company.sector,
      is_remote: false,
      visa_sponsorship: company.visa_sponsor,
      description,
      posted_at: j.publishedAt ? new Date(j.publishedAt) : null,
      external_id: `ashby:${company.ats_token}:${j.id}`,
      fingerprint: fp,
      ...score,
    });
    if (r.inserted) inserted++;
  }
  return { source: 'Ashby', company: company.name, total: jobs.length, inserted, skippedRemote };
}

// ═══════════════════════════════════════════════════════════
//  SMARTRECRUITERS — api.smartrecruiters.com/v1/companies/{id}/postings
// ═══════════════════════════════════════════════════════════
async function fetchSmartRecruiters(company) {
  const url = `https://api.smartrecruiters.com/v1/companies/${company.ats_token}/postings?limit=50`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`SmartRecruiters HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data.content || [];

  let inserted = 0, skippedRemote = 0;
  for (const j of jobs) {
    const locationRaw = `${j.location?.city || ''}, ${j.location?.country || ''}`.trim().replace(/^,\s*|\s*,\s*$/g, '');
    const remote = isRemote(j.name, locationRaw) || j.location?.remote === true;
    if (remote) { skippedRemote++; continue; }

    const score = await computeScore(j.name, '', locationRaw, j.releasedDate);
    const fp = makeFingerprint(company.name, j.name, locationRaw);

    const r = await insertJob({
      title: j.name,
      url: j.ref || `https://careers.smartrecruiters.com/${company.ats_token}/${j.id}`,
      company: company.name,
      company_url: `https://careers.smartrecruiters.com/${company.ats_token}`,
      location_country: j.location?.country?.toUpperCase()?.substring(0, 2) || detectCountry(locationRaw),
      location_city: j.location?.city || null,
      location_raw: locationRaw,
      sector: company.sector,
      is_remote: false,
      visa_sponsorship: company.visa_sponsor,
      posted_at: j.releasedDate ? new Date(j.releasedDate) : null,
      external_id: `sr:${company.ats_token}:${j.id}`,
      fingerprint: fp,
      ...score,
    });
    if (r.inserted) inserted++;
  }
  return { source: 'SmartRecruiters', company: company.name, total: jobs.length, inserted, skippedRemote };
}

// ═══════════════════════════════════════════════════════════
//  fetchAll — orchestrator
// ═══════════════════════════════════════════════════════════
const FETCHERS_BY_TYPE = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  smartrecruiters: fetchSmartRecruiters,
};

async function fetchAll() {
  const companies = await db.queryAll(
    'SELECT * FROM emp_tracked_companies WHERE is_active = TRUE ORDER BY ats_type, name'
  );
  let totalInserted = 0;
  let totalSkippedRemote = 0;
  const byCompany = [];

  for (const c of companies) {
    const fetcher = FETCHERS_BY_TYPE[c.ats_type];
    if (!fetcher) continue;
    try {
      const r = await fetcher(c);
      byCompany.push(r);
      totalInserted += r.inserted;
      totalSkippedRemote += r.skippedRemote;
      // Update last_fetched
      await db.query(
        `UPDATE emp_tracked_companies SET last_fetched = NOW(), last_count = $1 WHERE id = $2`,
        [r.total, c.id]
      );
      console.log(`💼 [${c.ats_type}/${c.name}] ${r.inserted} new / ${r.total} total · ${r.skippedRemote} remote→P5`);
      // throttle suave
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.warn(`⚠️ [${c.ats_type}/${c.name}]`, err.message);
      byCompany.push({ source: c.ats_type, company: c.name, error: err.message });
    }
  }
  return { totalInserted, totalSkippedRemote, byCompany };
}

module.exports = {
  fetchAll,
  fetchGreenhouse,
  fetchLever,
  fetchAshby,
  fetchSmartRecruiters,
  computeScore,
  insertJob,
  makeFingerprint,
  detectCountry,
  isRemote,
};
