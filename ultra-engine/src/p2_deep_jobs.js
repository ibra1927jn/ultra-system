// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — P2 deep jobs (2026-04-14 sesión pilar 2)   ║
// ║                                                            ║
// ║  Custom/non-Workday portals de alto valor sectorial:       ║
// ║   • DP World  — Oracle HCM public REST (528+ jobs)         ║
// ║   • BHP       — careers.bhp.com HTML scrape (mining)       ║
// ║   • Royal Caribbean Group — SAP SuccessFactors HTML         ║
// ║   • Torre.ai  — search.torre.co LatAm REST (164K opps)     ║
// ║                                                            ║
// ║  Rigzone descartado: CF 403 incluso vía puppeteer (IP      ║
// ║  datacenter Hetzner hard-blocked). Documentado 2026-04-14. ║
// ║                                                            ║
// ║  Regla P2 = presencial: is_remote=true descartado a P5.    ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');
const jobApis = require('./job_apis');

const UA = { 'User-Agent': 'Mozilla/5.0 (UltraSystem/1.0; +p2_deep_jobs.js)' };
const TIMEOUT = 25000;

function fp(company, title, location) {
  return crypto
    .createHash('sha256')
    .update(`${company}|${title}|${location}`.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

function decodeHtml(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

// ════════════════════════════════════════════════════════════
//  DP WORLD — Oracle HCM Cloud public REST
//  Endpoint: /hcmRestApi/resources/latest/recruitingCEJobRequisitions
//  siteNumber=CX_1 expone 500+ jobs globales.
// ════════════════════════════════════════════════════════════
async function fetchDPWorld({ limit = 100 } = {}) {
  const base = 'https://ehpv.fa.em2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions';
  const qs = `?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=CX_1,facetsList=LOCATIONS,limit=${limit}`;
  const r = await fetch(base + qs, { headers: { ...UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`DPW HTTP ${r.status}`);
  const d = await r.json();
  const items = (d.items?.[0]?.requisitionList) || [];

  let inserted = 0, skipped = 0, skippedRemote = 0;
  for (const j of items) {
    const isRemote = /remote|work from home/i.test(`${j.WorkplaceType || ''} ${j.Title || ''}`);
    if (isRemote) { skippedRemote++; continue; }
    const title = (j.Title || '').slice(0, 500);
    if (!title) { skipped++; continue; }
    const location = j.PrimaryLocation || '';
    const country = j.PrimaryLocationCountry || jobApis.detectCountry(location);
    const postedAt = j.PostedDate ? new Date(j.PostedDate).toISOString() : null;
    const url = `https://ehpv.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/${j.Id}`;
    const score = await jobApis.computeScore(title, j.ShortDescriptionStr || '', location, postedAt);
    const row = {
      title, url,
      region: country,
      category: 'logistics',
      company: 'DP World',
      company_url: 'https://www.dpworld.com/en/careers',
      location_country: country,
      location_city: null,
      location_raw: location.slice(0, 200),
      sector: 'logistics',
      job_type: j.ContractType || null,
      is_remote: false,
      salary_min: null, salary_max: null, salary_currency: null,
      visa_sponsorship: null,
      description: (j.ShortDescriptionStr || '').slice(0, 3000),
      posted_at: postedAt,
      matchScore: score.matchScore,
      speedScore: score.speedScore,
      difficultyScore: score.difficultyScore,
      totalScore: score.totalScore,
      fingerprint: fp('DP World', title, location),
      external_id: `dpworld:${j.Id}`,
    };
    const res = await jobApis.insertJob(row);
    if (res.inserted) inserted++; else skipped++;
  }
  return { source: 'dpworld', total: items.length, inserted, skipped, skippedRemote };
}

// ════════════════════════════════════════════════════════════
//  BHP — careers.bhp.com custom portal (mining, FIFO user target)
//  Paginado /search-jobs?CurrentPage=N. Titles llevan location
//  sufijo ("| Copper SA", "| Carrapateena", "| Manila").
// ════════════════════════════════════════════════════════════
const BHP_LOC_MAP = {
  'copper sa': 'CL', 'chile': 'CL', 'escondida': 'CL', 'minera escondida': 'CL',
  'carrapateena': 'AU', 'olympic dam': 'AU', 'prominent hill': 'AU',
  'adelaide': 'AU', 'perth': 'AU', 'brisbane': 'AU', 'melbourne': 'AU',
  'sydney': 'AU', 'mount arthur': 'AU', 'nickel west': 'AU',
  'manila': 'PH', 'kuala lumpur': 'MY',
  'saskatchewan': 'CA', 'canada': 'CA', 'toronto': 'CA',
  'singapore': 'SG', 'london': 'GB',
};

function bhpDetectCountry(titleOrLoc) {
  const l = (titleOrLoc || '').toLowerCase();
  for (const [k, iso] of Object.entries(BHP_LOC_MAP)) if (l.includes(k)) return iso;
  return null;
}

async function fetchBHP({ maxPages = 3 } = {}) {
  let inserted = 0, skipped = 0;
  const seen = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://careers.bhp.com/search-jobs?CurrentPage=${page}`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) break;
    const t = await r.text();
    const re = /href="(\/job\/([^\/"]+)\/(\d+)\/)"[^>]*>([^<]{5,200})</g;
    let m, got = 0;
    while ((m = re.exec(t))) {
      const id = m[3];
      if (seen.has(id)) continue;
      seen.add(id);
      got++;
      const href = decodeHtml(m[1]);
      const title = decodeHtml(m[4]).trim().slice(0, 500);
      if (!title) { skipped++; continue; }
      const country = bhpDetectCountry(title);
      const location = title.split('|').slice(1).join('|').trim() || 'BHP site';
      const score = await jobApis.computeScore(title, '', location, null);
      const row = {
        title, url: `https://careers.bhp.com${href}`,
        region: country,
        category: 'mining',
        company: 'BHP',
        company_url: 'https://careers.bhp.com/',
        location_country: country,
        location_city: null,
        location_raw: location.slice(0, 200),
        sector: 'mining',
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
        fingerprint: fp('BHP', title, location),
        external_id: `bhp:${id}`,
      };
      const res = await jobApis.insertJob(row);
      if (res.inserted) inserted++; else skipped++;
    }
    if (got === 0) break;
    await new Promise((r) => setTimeout(r, 900));
  }
  return { source: 'bhp', inserted, skipped, totalSeen: seen.size };
}

// ════════════════════════════════════════════════════════════
//  RCG — Royal Caribbean Group (SAP SuccessFactors Jobs2Web)
//  /search-jobs con anchors /job/{Location-Title-Suffix}/{id}/.
// ════════════════════════════════════════════════════════════
async function fetchRCG({ maxPages = 3 } = {}) {
  let inserted = 0, skipped = 0;
  const seen = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://jobs.royalcaribbeangroup.com/search-jobs?p=${page}`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) break;
    const t = await r.text();
    const re = /<a[^>]+class="[^"]*job[^"]*"[^>]+href="(\/job\/([^"]+)\/(\d+)\/)"[^>]*>([^<]{5,200})</g;
    let m, got = 0;
    while ((m = re.exec(t))) {
      const id = m[3];
      if (seen.has(id)) continue;
      seen.add(id);
      got++;
      const title = decodeHtml(m[4]).trim().slice(0, 500);
      // Location está en el slug primera parte (e.g. "Pasay-Sr-Engineer")
      const slug = m[2];
      const locGuess = slug.split('-').slice(0, 2).join(' ');
      const country = jobApis.detectCountry(locGuess) || jobApis.detectCountry(slug);
      const score = await jobApis.computeScore(title, '', locGuess, null);
      const row = {
        title,
        url: `https://jobs.royalcaribbeangroup.com${decodeHtml(m[1])}`,
        region: country,
        category: 'maritime',
        company: 'Royal Caribbean Group',
        company_url: 'https://careers.royalcaribbeangroup.com/',
        location_country: country,
        location_city: null,
        location_raw: locGuess.slice(0, 200),
        sector: 'maritime',
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
        fingerprint: fp('Royal Caribbean Group', title, locGuess),
        external_id: `rcg:${id}`,
      };
      const res = await jobApis.insertJob(row);
      if (res.inserted) inserted++; else skipped++;
    }
    if (got === 0) break;
    await new Promise((r) => setTimeout(r, 900));
  }
  return { source: 'rcg', inserted, skipped, totalSeen: seen.size };
}

// ════════════════════════════════════════════════════════════
//  TORRE.AI — search.torre.co public REST (164K opportunities)
//  Sin auth. body={} devuelve todos. Filtramos remote=true→P5.
//  Muchas oportunidades son LatAm hispanoparlantes — cuadran
//  con perfil del usuario (DZ/ES native, NZ residence).
// ════════════════════════════════════════════════════════════
async function fetchTorre({ pages = 10, size = 20 } = {}) {
  // size máximo soportado por Torre = 20 (size=50 → 400). Validado 2026-04-14.
  let inserted = 0, skipped = 0, skippedRemote = 0;
  for (let p = 0; p < pages; p++) {
    const url = `https://search.torre.co/opportunities/_search/?offset=${p * size}&size=${size}&aggregate=false`;
    // Nota: Torre rechaza requests con User-Agent de bot (400). Enviamos
    // solo Content-Type/Accept estándar — validado 2026-04-14.
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) break;
    const d = await r.json();
    const results = d.results || [];
    if (!results.length) break;

    for (const j of results) {
      if (j.remote === true) { skippedRemote++; continue; }
      const title = (j.objective || '').slice(0, 500);
      if (!title) { skipped++; continue; }
      const locations = Array.isArray(j.locations) ? j.locations : [];
      const locationRaw = locations.join(' · ').slice(0, 200) || '(unspecified)';
      const country = jobApis.detectCountry(locationRaw);
      const company = j.organizations?.[0]?.name || 'Torre employer';
      const postedAt = j.created || null;
      const salary = j.compensation?.data;
      const score = await jobApis.computeScore(title, '', locationRaw, postedAt);
      const row = {
        title,
        url: `https://torre.ai/jobs/${j.id}/${j.slug || ''}`,
        region: country,
        category: 'latam',
        company: company.slice(0, 255),
        company_url: 'https://torre.ai/',
        location_country: country,
        location_city: null,
        location_raw: locationRaw,
        sector: j.commitment || null,
        job_type: j.commitment || null,
        is_remote: false,
        salary_min: salary?.minAmount || null,
        salary_max: salary?.maxAmount || null,
        salary_currency: salary?.currency || null,
        visa_sponsorship: null,
        description: '',
        posted_at: postedAt,
        matchScore: score.matchScore,
        speedScore: score.speedScore,
        difficultyScore: score.difficultyScore,
        totalScore: score.totalScore,
        fingerprint: fp(company, title, locationRaw),
        external_id: `torre:${j.id}`,
      };
      const res = await jobApis.insertJob(row);
      if (res.inserted) inserted++; else skipped++;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return { source: 'torre', inserted, skipped, skippedRemote };
}

async function fetchAll() {
  const results = [];
  for (const fn of [fetchDPWorld, fetchBHP, fetchRCG, fetchTorre]) {
    try { results.push(await fn()); }
    catch (e) { results.push({ source: fn.name, error: e.message }); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return results;
}

module.exports = { fetchDPWorld, fetchBHP, fetchRCG, fetchTorre, fetchAll };
