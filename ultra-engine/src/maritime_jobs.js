// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Maritime jobs v2 (CrewBay, 2026-04-14)    ║
// ║                                                            ║
// ║  Complementa maritime.js (puppeteer→AllCruiseJobs). Este   ║
// ║  módulo añade:                                             ║
// ║   - CrewBay /boats/professional → /job/{id} (HTTP simple)  ║
// ║   - AllCruiseJobs via sector pages (plain HTTP fallback    ║
// ║     cuando el sidecar puppeteer no está disponible)        ║
// ║                                                            ║
// ║  SeaJobs descartado: dominio parked (Parklogic redirect).  ║
// ║  BHP/Royal Caribbean/DP World: NO son Workday (verificado  ║
// ║  2026-04-14: BHP custom, RCL rclctrac.com, DPW Oracle HCM).║
// ║  Rigzone → gov_jobs.js.                                    ║
// ║                                                            ║
// ║  Reusa insertJob/computeScore/detectCountry de job_apis.   ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');
const jobApis = require('./job_apis');

const UA = {
  'User-Agent': 'Mozilla/5.0 (UltraSystem/1.0; +maritime_jobs.js)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
const TIMEOUT = 25000;

function fp(company, title, location) {
  return crypto
    .createHash('sha256')
    .update(`${company}|${title}|${location}`.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

// ═══════════════════════════════════════════════════════════
//  CREWBAY — /boats/professional lists boats offering crew
//  positions. Each card links to /job/{id}. Title pattern:
//  "{Vessel} - {Position} - {Duration} - {Pay} - {Country}"
//  viene de la meta del detail. En la lista sólo tenemos el
//  nombre del barco; para extraer position/country hay que
//  fetchear cada /job/{id}. Pagination = ?page=2..N (50/page).
// ═══════════════════════════════════════════════════════════
async function fetchCrewBay({ maxPages = 3, maxDetails = 60 } = {}) {
  let inserted = 0, skipped = 0, details = 0;
  const jobIds = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.crewbay.com/boats/professional${page > 1 ? `?page=${page}` : ''}`;
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
      if (!r.ok) break;
      const html = await r.text();
      const matches = [...html.matchAll(/href="(https:\/\/www\.crewbay\.com\/job\/(\d+))"/g)];
      const before = jobIds.size;
      for (const m of matches) jobIds.add(m[2]);
      if (jobIds.size === before) break; // no nuevos = fin de paginación
      await new Promise((res) => setTimeout(res, 800));
    } catch (_) {
      break;
    }
  }

  for (const id of jobIds) {
    if (details >= maxDetails) break;
    details++;
    const detailUrl = `https://www.crewbay.com/job/${id}`;
    try {
      const r = await fetch(detailUrl, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
      if (!r.ok) { skipped++; continue; }
      const html = await r.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (!titleMatch) { skipped++; continue; }
      const fullTitle = titleMatch[1].trim();
      // "Vessel - Position - Duration - Pay - Country"
      const parts = fullTitle.split(' - ').map((s) => s.trim());
      const vessel = parts[0] || '';
      const position = parts[1] || fullTitle;
      const duration = parts[2] || null;
      const pay = parts[3] || null;
      const countryText = parts[4] || '';
      const country = jobApis.detectCountry(countryText) || null;
      const locationRaw = countryText.substring(0, 200) || vessel;

      // P2 = presencial; los puestos de tripulación son por definición a bordo.
      const score = await jobApis.computeScore(position, fullTitle, locationRaw, null);
      const row = {
        title: position,
        url: detailUrl,
        region: country,
        category: 'maritime',
        company: vessel,
        company_url: 'https://www.crewbay.com/',
        location_country: country,
        location_city: null,
        location_raw: locationRaw,
        sector: 'maritime',
        job_type: /temporary|seasonal/i.test(duration || '') ? 'seasonal'
                  : /permanent/i.test(duration || '') ? 'permanent' : null,
        is_remote: false,
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        visa_sponsorship: null,
        description: pay ? `Pay: ${pay}${duration ? `; Duration: ${duration}` : ''}` : duration || '',
        posted_at: null,
        matchScore: score.matchScore,
        speedScore: score.speedScore,
        difficultyScore: score.difficultyScore,
        totalScore: score.totalScore,
        fingerprint: fp(vessel, position, locationRaw),
        external_id: `crewbay:${id}`,
      };
      const res2 = await jobApis.insertJob(row);
      if (res2.inserted) inserted++; else skipped++;
      await new Promise((r) => setTimeout(r, 400));
    } catch (_) {
      skipped++;
    }
  }
  return { source: 'crewbay', inserted, skipped, detailsFetched: details, totalListed: jobIds.size };
}

// ═══════════════════════════════════════════════════════════
//  ALLCRUISEJOBS — sector pages /{sector}-jobs/ listan ofertas
//  con patrón de detail /i{ID}/{slug}/. La lista ya contiene
//  title + link; la company (cruise line) y location (ship)
//  no aparecen en la lista, las extraemos via detail meta.
// ═══════════════════════════════════════════════════════════
const ACJ_SECTORS = [
  'deck', 'engine', 'galley', 'housekeeping', 'restaurant',
  'beverages', 'provisions', 'entertainment',
];

async function fetchAllCruiseJobs({ maxPerSector = 30 } = {}) {
  let inserted = 0, skipped = 0;
  const seen = new Set();
  for (const sector of ACJ_SECTORS) {
    const listUrl = `https://www.allcruisejobs.com/${sector}-jobs/`;
    try {
      const r = await fetch(listUrl, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
      if (!r.ok) continue;
      const html = await r.text();
      const re = /<a[^>]+href="(https:\/\/www\.allcruisejobs\.com\/i(\d+)\/([^"\/]+)\/?)"[^>]*>([^<]{3,200})<\/a>/g;
      const items = [];
      let m;
      while ((m = re.exec(html)) !== null) {
        const [, href, id, slug, label] = m;
        if (seen.has(id)) continue;
        seen.add(id);
        const title = label.trim();
        if (title.length < 3 || /view job|apply/i.test(title)) continue;
        items.push({ href, id, slug, title });
        if (items.length >= maxPerSector) break;
      }
      for (const it of items) {
        const locationRaw = 'Cruise ship'; // lista no expone location; detail opcional
        const country = null;
        const score = await jobApis.computeScore(it.title, '', locationRaw, null);
        const row = {
          title: it.title.substring(0, 500),
          url: it.href,
          region: null,
          category: 'maritime',
          company: 'Cruise operator (multi)',
          company_url: 'https://www.allcruisejobs.com/',
          location_country: country,
          location_city: null,
          location_raw: locationRaw,
          sector: 'maritime',
          job_type: null,
          is_remote: false,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          visa_sponsorship: null,
          description: `Cruise ship ${sector} department`,
          posted_at: null,
          matchScore: score.matchScore,
          speedScore: score.speedScore,
          difficultyScore: score.difficultyScore,
          totalScore: score.totalScore,
          fingerprint: fp('cruiseship', it.title, `acj:${sector}`),
          external_id: `allcruisejobs:${it.id}`,
        };
        const res2 = await jobApis.insertJob(row);
        if (res2.inserted) inserted++; else skipped++;
      }
      await new Promise((r) => setTimeout(r, 700));
    } catch (_) {
      // continue next sector
    }
  }
  return { source: 'allcruisejobs', inserted, skipped, sectors: ACJ_SECTORS.length };
}

async function fetchAll() {
  const results = [];
  for (const fn of [fetchCrewBay, fetchAllCruiseJobs]) {
    try { results.push(await fn()); }
    catch (e) { results.push({ source: fn.name, error: e.message }); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return results;
}

module.exports = { fetchCrewBay, fetchAllCruiseJobs, fetchAll };
