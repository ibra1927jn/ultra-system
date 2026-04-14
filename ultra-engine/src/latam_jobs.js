// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — LatAm jobs via GetOnBoard API (P2)         ║
// ║                                                            ║
// ║  Fuente: https://www.getonbrd.com/api/v0 (free, no auth).  ║
// ║  LatAm coverage gap — principalmente Chile, Argentina,     ║
// ║  México, Colombia, Perú. Filtra remote=true (van a P5).    ║
// ║                                                            ║
// ║  Categorías incluidas (18 total, usamos subset tech):      ║
// ║   programming, mobile-developer, sysadmin-devops-qa,       ║
// ║   data-science-analytics, machine-learning-ai, design-ux,  ║
// ║   cybersecurity, hardware-electronics.                     ║
// ║                                                            ║
// ║  GetOnBoard retorna company como referencia por ID — no    ║
// ║  embebemos el include (API inconsistente). Guardamos el    ║
// ║  ID como company y el nombre lo resuelve el usuario en UI. ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');
const jobApis = require('./job_apis');

const UA = { 'User-Agent': 'UltraSystem/1.0 (getonbrd public api)' };
const TIMEOUT = 20000;
const BASE = 'https://www.getonbrd.com/api/v0';

const CATEGORIES = [
  'programming', 'mobile-developer', 'sysadmin-devops-qa',
  'data-science-analytics', 'machine-learning-ai', 'design-ux',
  'cybersecurity', 'hardware-electronics',
];

// GetOnBoard 'countries' es lista de nombres en español/inglés
const COUNTRY_MAP = {
  chile: 'CL', argentina: 'AR', mexico: 'MX', 'méxico': 'MX',
  colombia: 'CO', peru: 'PE', 'perú': 'PE', uruguay: 'UY',
  ecuador: 'EC', venezuela: 'VE', brasil: 'BR', brazil: 'BR',
  bolivia: 'BO', paraguay: 'PY', costa_rica: 'CR', 'costa rica': 'CR',
  panama: 'PA', 'panamá': 'PA', guatemala: 'GT', honduras: 'HN',
  'el salvador': 'SV', nicaragua: 'NI', 'república dominicana': 'DO',
  spain: 'ES', 'españa': 'ES',
};

function fp(company, title, location) {
  return crypto
    .createHash('sha256')
    .update(`${company}|${title}|${location}`.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

function detectLatamCountry(countries) {
  if (!Array.isArray(countries)) return null;
  for (const c of countries) {
    const key = String(c).toLowerCase().trim();
    if (COUNTRY_MAP[key]) return COUNTRY_MAP[key];
  }
  return null;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchCategory(category, { perPage = 50 } = {}) {
  const url = `${BASE}/categories/${category}/jobs?per_page=${perPage}`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`GetOnBoard ${category} HTTP ${r.status}`);
  const data = await r.json();
  const jobs = data.data || [];

  let inserted = 0, skippedRemote = 0, skipped = 0;
  for (const j of jobs) {
    const a = j.attributes || {};
    if (a.remote === true) { skippedRemote++; continue; } // P2 = presencial
    const countries = a.countries || [];
    const country = detectLatamCountry(countries);
    const locationRaw = countries.join(', ').substring(0, 200) || 'LatAm';

    const title = (a.title || '').substring(0, 500);
    if (!title) { skipped++; continue; }

    const desc = stripHtml(a.description).substring(0, 3000);
    const postedAt = a.published_at ? new Date(a.published_at * 1000).toISOString() : null;

    const companyRef = (a.company && a.company.data && a.company.data.id) || 'unknown';
    const companyName = `GetOnBoard:${companyRef}`;
    const jobUrl = (j.links && j.links.public_url) || `https://www.getonbrd.com/jobs/${j.id}`;

    const score = await jobApis.computeScore(title, desc, locationRaw, postedAt);
    const row = {
      title,
      url: jobUrl,
      region: country,
      category: 'latam',
      company: companyName,
      company_url: 'https://www.getonbrd.com/',
      location_country: country,
      location_city: null,
      location_raw: locationRaw,
      sector: category,
      job_type: a.modality?.data?.id === 3 ? 'hybrid' : null,
      is_remote: false,
      salary_min: a.min_salary || null,
      salary_max: a.max_salary || null,
      salary_currency: a.currency || 'USD',
      visa_sponsorship: null,
      description: desc,
      posted_at: postedAt,
      matchScore: score.matchScore,
      speedScore: score.speedScore,
      difficultyScore: score.difficultyScore,
      totalScore: score.totalScore,
      fingerprint: fp(companyName, title, locationRaw),
      external_id: `getonbrd:${j.id}`,
    };
    const res = await jobApis.insertJob(row);
    if (res.inserted) inserted++; else skipped++;
  }
  return { category, total: jobs.length, inserted, skipped, skippedRemote };
}

async function fetchAll() {
  const results = [];
  for (const cat of CATEGORIES) {
    try { results.push(await fetchCategory(cat)); }
    catch (e) { results.push({ category: cat, error: e.message }); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return results;
}

module.exports = { CATEGORIES, fetchCategory, fetchAll };
