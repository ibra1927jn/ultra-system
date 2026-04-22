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
const jobApis = require('./job_apis');

// Tenants VERIFICADOS live — params: { tenant, site, subdomain, name, sector }
// R5 cleanup: removidos 11 tenants R3 que devolvían 401/422/404 (Atlassian/Cisco/
// Twilio/Stripe/McKinsey/Deloitte/KPMG/EY/JPMorgan/GS no usan Workday — están en
// Greenhouse/SmartRecruiters/custom).
// R6: Stripe + Twilio + 18 más cubiertos por fetchGreenhouse en opp_fetchers.js
const TENANTS = [
  { tenant: 'salesforce', site: 'External_Career_Site', subdomain: 'wd12', name: 'Salesforce', sector: 'devtools' },
  { tenant: 'nvidia', site: 'nvidiaexternalcareersite', subdomain: 'wd5', name: 'NVIDIA', sector: 'ai' },
  { tenant: 'accenture', site: 'AccentureCareers', subdomain: 'wd103', name: 'Accenture', sector: 'consulting' },
  { tenant: 'pwc', site: 'Global_Experienced_Careers', subdomain: 'wd3', name: 'PwC', sector: 'consulting' },
  { tenant: 'pfizer', site: 'PfizerCareers', subdomain: 'wd1', name: 'Pfizer', sector: 'pharma' },
  { tenant: 'wilhelmsen', site: 'Wilhelmsen', subdomain: 'wd3', name: 'Wilhelmsen', sector: 'maritime' },
  { tenant: 'netflix', site: 'Netflix', subdomain: 'wd1', name: 'Netflix', sector: 'media' },
  // R5 verified live (HTTP 200):
  { tenant: 'adobe', site: 'external_experienced', subdomain: 'wd5', name: 'Adobe', sector: 'devtools' },
  { tenant: 'adobe', site: 'external_university', subdomain: 'wd5', name: 'Adobe (University)', sector: 'devtools' },
  // Tier S P2 additions (2026-04-14) — sector primario user + logística/energía
  // BHP (careers.bhp.com custom), Royal Caribbean (rclctrac.com) y DP World
  // (Oracle HCM) NO usan Workday — verificado 2026-04-14, no añadidos.
  { tenant: 'maersk',  site: 'Maersk_Careers',              subdomain: 'wd3',   name: 'Maersk',                 sector: 'maritime' },
  { tenant: 'equinor', site: 'EQNR',                         subdomain: 'wd3',   name: 'Equinor',                sector: 'energy' },
  { tenant: 'fedex',   site: 'FXE-LAC_External_Career_Site', subdomain: 'wd1',   name: 'FedEx',                  sector: 'logistics' },
  { tenant: 'nclh',    site: 'POA_Careers',                  subdomain: 'wd108', name: 'NCL Pride of America',   sector: 'maritime' },
  { tenant: 'nclh',    site: 'NCLH_Careers',                 subdomain: 'wd108', name: 'Norwegian Cruise Line',  sector: 'maritime' },
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
