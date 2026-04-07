// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Workday universal scraper (P2 Fase 3b)   ║
// ║                                                            ║
// ║  Workday CX endpoints públicos (POST JSON, no auth):       ║
// ║   /wday/cxs/{tenant}/{site}/jobs                           ║
// ║                                                            ║
// ║  Cada empresa tiene tenant + site + subdomain específicos. ║
// ║  Curated list de las que funcionan sin params especiales.  ║
// ║                                                            ║
// ║  Reusa insertJob() de job_apis.js con scoring estándar.    ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');
const db = require('./db');
const jobApis = require('./job_apis');

// Tenants verificados — params: { tenant, site, subdomain, name, country?, sector? }
const TENANTS = [
  { tenant: 'salesforce', site: 'External_Career_Site', subdomain: 'wd12', name: 'Salesforce', sector: 'devtools' },
  { tenant: 'nvidia', site: 'nvidiaexternalcareersite', subdomain: 'wd5', name: 'NVIDIA', sector: 'ai' },
  { tenant: 'accenture', site: 'AccentureCareers', subdomain: 'wd103', name: 'Accenture', sector: 'consulting' },
  // Fase 3c additions:
  { tenant: 'pwc', site: 'Global_Experienced_Careers', subdomain: 'wd3', name: 'PwC', sector: 'consulting' },
  { tenant: 'pfizer', site: 'PfizerCareers', subdomain: 'wd1', name: 'Pfizer', sector: 'pharma' },
];

const TIMEOUT = 25000;

function makeFingerprint(company, title, location) {
  return crypto.createHash('sha256').update(`${company}|${title}|${location}`.toLowerCase()).digest('hex').slice(0, 32);
}

async function fetchTenant(t) {
  const url = `https://${t.tenant}.${t.subdomain}.myworkdayjobs.com/wday/cxs/${t.tenant}/${t.site}/jobs`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'UltraSystem/1.0' },
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`Workday ${t.tenant} HTTP ${r.status}`);
  const data = await r.json();
  const postings = data.jobPostings || [];
  let inserted = 0, skipped = 0;
  for (const j of postings) {
    const title = j.title || '';
    const location = j.locationsText || '';
    // Skip remote (P2 = presencial)
    if (/\b(remote|work from home|wfh)\b/i.test(`${title} ${location}`)) { skipped++; continue; }
    // Try to detect country from location
    const country = jobApis.detectCountry(location) || null;
    const score = await jobApis.computeScore(title, '', location, null);
    const url = `https://${t.tenant}.${t.subdomain}.myworkdayjobs.com${j.externalPath || ''}`;
    const row = {
      title, url,
      region: country,
      category: 'workday',
      company: t.name,
      company_url: `https://${t.tenant}.${t.subdomain}.myworkdayjobs.com`,
      location_country: country,
      location_raw: location,
      sector: t.sector,
      job_type: null,
      is_remote: false,
      salary_min: null, salary_max: null, salary_currency: null,
      visa_sponsorship: null,
      description: '',
      posted_at: null,
      matchScore: score.matchScore,
      speedScore: score.speedScore,
      difficultyScore: score.difficultyScore,
      totalScore: score.totalScore,
      fingerprint: makeFingerprint(t.name, title, location),
      external_id: `workday:${t.tenant}:${(j.bulletFields || []).join('-')}`,
    };
    const r2 = await jobApis.insertJob(row);
    if (r2.inserted) inserted++; else skipped++;
  }
  return { tenant: t.tenant, total: postings.length, inserted, skipped };
}

async function fetchAll() {
  const results = [];
  for (const t of TENANTS) {
    try { results.push(await fetchTenant(t)); }
    catch (e) { results.push({ tenant: t.tenant, error: e.message }); }
    await new Promise(r => setTimeout(r, 1500));
  }
  return results;
}

module.exports = { TENANTS, fetchTenant, fetchAll };
