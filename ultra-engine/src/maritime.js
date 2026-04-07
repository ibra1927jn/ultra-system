// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Maritime jobs (Tier S #1)                 ║
// ║                                                            ║
// ║  Sector declarado por el usuario (0% coverage pre-R6).    ║
// ║  Cubre el gap más grande del sistema en P2 Empleo.         ║
// ║                                                            ║
// ║  Fuentes (2026-04-08):                                     ║
// ║   ✅ AllCruiseJobs — puppeteer, multi-company sweep        ║
// ║   ⏸ CrewBay        — login-gated (step 4 signup)           ║
// ║   ⏸ SeaJobs        — SSL cert inválido (dead)              ║
// ║                                                            ║
// ║  Complementario a Workday.Wilhelmsen (ya en workday.js).   ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');
const jobApis = require('./job_apis');

const TIMEOUT = 90000;

function makeFingerprint(company, title, location) {
  return crypto.createHash('sha256').update(`${company}|${title}|${location}`.toLowerCase()).digest('hex').slice(0, 32);
}

// ═══════════════════════════════════════════════════════════
//  AllCruiseJobs — 11 cruise lines, single shared ATS
// ═══════════════════════════════════════════════════════════
// Homepage lista 16+ /jobs/{company}/ anchors. Cada company page tiene
// job detail URLs en shape `/i{ID}/{slug}/`. Text del anchor = title.
// Categoría vive en el title (e.g. "Carnival UK - Youth Manager" → role).
// Insertamos via job_apis.insertJob con sector='maritime'.
const ACJ_COMPANIES = [
  'carnival-uk', 'seabourn', 'viking-cruises', 'costa', 'aida',
  'msc-cruises', 'explora-journeys', 'princess-cruises',
  'royal-caribbean-group', 'norwegian-cruise-line', 'holland-america-line',
  'celebrity-cruises', 'cunard', 'p-and-o-cruises',
];

async function fetchAllCruiseJobs() {
  const pup = require('./puppeteer');
  if (!(await pup.isAvailable())) {
    return { source: 'AllCruiseJobs', total: 0, inserted: 0, skipped: 'puppeteer_sidecar_offline' };
  }

  const seen = new Set();
  let total = 0, inserted = 0, skipped = 0, errors = 0;

  // Human-readable company names (matches title prefix on ACJ)
  const COMPANY_NAMES = {
    'carnival-uk': 'Carnival UK',
    'seabourn': 'Seabourn',
    'viking-cruises': 'Viking Cruises',
    'costa': 'Costa',
    'aida': 'AIDA',
    'msc-cruises': 'MSC Cruises',
    'explora-journeys': 'Explora Journeys',
    'princess-cruises': 'Princess Cruises',
    'royal-caribbean-group': 'Royal Caribbean Group',
    'norwegian-cruise-line': 'Norwegian Cruise Line',
    'holland-america-line': 'Holland America Line',
    'celebrity-cruises': 'Celebrity Cruises',
    'cunard': 'Cunard',
    'p-and-o-cruises': 'P&O Cruises',
  };

  for (const company of ACJ_COMPANIES) {
    const companyName = COMPANY_NAMES[company] || company.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    try {
      const r = await pup.scrape({
        url: `https://www.allcruisejobs.com/jobs/${company}/`,
        waitFor: 2500,
        selectors: { jobs: 'a[href*="/i"]' },
      });
      if (!r.ok) { errors++; continue; }

      const items = r.data?.jobs || [];
      for (const it of items) {
        const href = (it.href || '').replace(/\/$/, '');
        // Detail URL pattern: /i{digits}/{slug}/
        const match = href.match(/allcruisejobs\.com\/i(\d+)\/([^/?#]+)/);
        if (!match) continue;
        const jobId = match[1];
        const slug = match[2];
        if (seen.has(jobId)) continue;
        seen.add(jobId);
        total++;

        // Title comes in anchor text like "Carnival UK - Youth Manager"
        // Strip the company prefix if present, keep the rest as title.
        const rawTitle = (it.text || '').replace(/\s+/g, ' ').trim();
        if (!rawTitle) { skipped++; continue; }

        // Remove leading "{CompanyName} - " if present (case-insensitive).
        // Fallback: full rawTitle.
        const prefixRegex = new RegExp(`^${companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i');
        const jobTitle = rawTitle.replace(prefixRegex, '').trim() || rawTitle;

        const score = await jobApis.computeScore(jobTitle, '', '', null);

        const row = {
          title: jobTitle.slice(0, 500),
          url: `https://www.allcruisejobs.com/i${jobId}/${slug}/`,
          region: null,
          category: 'maritime_cruise',
          company: companyName.slice(0, 200),
          company_url: `https://www.allcruisejobs.com/jobs/${company}/`,
          location_country: null,
          location_raw: 'at sea',
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
          fingerprint: makeFingerprint(companyName, jobTitle, 'at sea'),
          external_id: `acj:${jobId}`,
        };

        const res = await jobApis.insertJob(row);
        if (res.inserted) inserted++; else skipped++;
      }
    } catch (err) {
      errors++;
      if (errors >= 3) break;
    }
  }

  return { source: 'AllCruiseJobs', total, inserted, skipped, errors, companies_scanned: ACJ_COMPANIES.length, via: 'puppeteer' };
}

// ═══════════════════════════════════════════════════════════
//  CrewBay — login-gated, step 4
// ═══════════════════════════════════════════════════════════
async function fetchCrewBay() {
  return { source: 'CrewBay', total: 0, inserted: 0, skipped: 'login_required_see_signups_md' };
}

// ═══════════════════════════════════════════════════════════
//  SeaJobs — SSL cert inválido
// ═══════════════════════════════════════════════════════════
async function fetchSeaJobs() {
  return { source: 'SeaJobs', total: 0, inserted: 0, skipped: 'ssl_cert_common_name_invalid' };
}

async function fetchAll() {
  const results = [];
  for (const fn of [fetchAllCruiseJobs, fetchCrewBay, fetchSeaJobs]) {
    try { results.push(await fn()); }
    catch (e) { results.push({ source: fn.name, error: e.message }); }
  }
  return results;
}

module.exports = {
  fetchAll,
  fetchAllCruiseJobs,
  fetchCrewBay,
  fetchSeaJobs,
};
