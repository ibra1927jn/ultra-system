// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Profile-based matching (P5 Fase 2)       ║
// ║                                                            ║
// ║  Computa match_score (0-100) entre opportunity/job y     ║
// ║  emp_profile id=1.                                         ║
// ║                                                            ║
// ║  Factores:                                                 ║
// ║   - skill match (50): % de skills del profile presentes   ║
// ║     en title+description+tags                              ║
// ║   - country preference (15): si coincide con              ║
// ║     preferred_countries                                    ║
// ║   - sector preference (10): si coincide con preferred_    ║
// ║     sectors                                                ║
// ║   - language requirement (10): si languages del usuario   ║
// ║     cubren los requeridos                                  ║
// ║   - salary fit (15): si salary >= min_salary_nzd          ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

let cachedProfile = null;
let cacheTime = 0;

async function getProfile() {
  if (cachedProfile && (Date.now() - cacheTime) < 60000) return cachedProfile;
  cachedProfile = await db.queryOne('SELECT * FROM emp_profile WHERE id = 1');
  cacheTime = Date.now();
  return cachedProfile;
}

function clearCache() { cachedProfile = null; }

function normalize(s) { return String(s || '').toLowerCase(); }

/**
 * Computa match_score (0-100) para un opportunity/job vs profile.
 * @param {object} item - { title, description, tags, country, sector, salary_min, salary_max, currency, language_req }
 * @param {object} profile - emp_profile row
 */
function computeMatchScore(item, profile) {
  if (!profile) return 0;
  let score = 0;
  const text = normalize(`${item.title || ''} ${item.description || ''} ${(item.tags || []).join(' ')}`);

  // 1. Skill match (50)
  const skills = profile.skills || [];
  let hits = 0;
  for (const skill of skills) {
    if (text.includes(normalize(skill))) hits++;
  }
  const skillScore = skills.length > 0 ? Math.round((hits / skills.length) * 50) : 0;
  score += Math.min(50, skillScore + Math.min(20, hits * 3)); // bonus por hits

  // 2. Country preference (15)
  if (item.country && profile.preferred_countries?.includes(item.country)) {
    score += 15;
  }

  // 3. Sector preference (10)
  if (item.sector) {
    const sectorLower = normalize(item.sector);
    if ((profile.preferred_sectors || []).some(s => sectorLower.includes(normalize(s)))) {
      score += 10;
    }
  }

  // 4. Language fit (10)
  if (item.language_req) {
    const userLangs = (profile.languages || []).map(l => normalize(l.lang));
    const reqLang = normalize(item.language_req);
    if (userLangs.some(l => reqLang.includes(l))) score += 10;
  } else {
    score += 5; // sin requisito = neutral
  }

  // 5. Salary fit (15)
  if (item.salary_min) {
    const min = parseFloat(item.salary_min);
    const profileMin = parseFloat(profile.min_salary_nzd || 0);
    // Asume mismo currency por ahora; en produc traduce a NZD via fx
    if (min >= profileMin) score += 15;
    else if (min >= profileMin * 0.7) score += 8;
  }

  return Math.min(100, score);
}

/**
 * Re-puntúa todas las opportunities (no marcadas como dup) según el profile.
 */
async function rescoreOpportunities() {
  const profile = await getProfile();
  if (!profile) return { ok: false, reason: 'No emp_profile id=1' };

  const rows = await db.queryAll(
    `SELECT id, title, description, tags, language_req, salary_min, salary_max, currency, source
     FROM opportunities
     WHERE duplicate_of IS NULL`
  );

  let updated = 0;
  for (const r of rows) {
    const score = computeMatchScore(r, profile);
    await db.query('UPDATE opportunities SET match_score = $1 WHERE id = $2', [score, r.id]);
    updated++;
  }
  return { ok: true, scanned: rows.length, updated };
}

/**
 * Re-puntúa job_listings según profile.
 */
async function rescoreJobs() {
  const profile = await getProfile();
  if (!profile) return { ok: false, reason: 'No emp_profile id=1' };

  const rows = await db.queryAll(
    `SELECT id, title, description, location_country AS country, sector, salary_min, salary_max
     FROM job_listings
     WHERE duplicate_of IS NULL`
  );

  let updated = 0;
  for (const r of rows) {
    const score = computeMatchScore(r, profile);
    // Actualiza match_score (parte del total_score generated)
    await db.query('UPDATE job_listings SET match_score = $1 WHERE id = $2', [score, r.id]);
    updated++;
  }
  return { ok: true, scanned: rows.length, updated };
}

module.exports = {
  getProfile,
  clearCache,
  computeMatchScore,
  rescoreOpportunities,
  rescoreJobs,
};
