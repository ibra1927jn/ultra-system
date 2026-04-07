// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Opportunities Fetchers (P5)              ║
// ║                                                          ║
// ║  Decisión 2026-04-07: P5 = remoto, P2 = presencial.      ║
// ║  Todos los fetchers aquí devuelven posiciones REMOTE     ║
// ║  → ruta directa a tabla `opportunities`.                 ║
// ║                                                          ║
// ║  Fuentes (todas free, no auth):                          ║
// ║   • RemoteOK     /api                                    ║
// ║   • Remotive     /api/remote-jobs                        ║
// ║   • Himalayas    /jobs/api                               ║
// ║   • Jobicy       /api/v2/remote-jobs                     ║
// ║   • Hacker News  Algolia /search/whoishiring             ║
// ║   • GitHub bounty issues vía search/issues               ║
// ║                                                          ║
// ║  Scoring: reusa rss_keywords (mismo modelo P1/P5).       ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; UltraSystem/1.0)' };
const TIMEOUT = 20000;

// ─── helpers ────────────────────────────────────────────
async function scoreText(text) {
  if (!text) return 0;
  const kws = await db.queryAll('SELECT keyword, weight FROM rss_keywords');
  if (!kws.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const k of kws) {
    if (lower.includes(k.keyword.toLowerCase())) score += k.weight;
  }
  return score;
}

async function insertOpportunity(row) {
  // Dedup parcial por url unique
  if (!row.url) return false;
  const r = await db.queryOne(
    `INSERT INTO opportunities
       (title, source, source_type, url, category, status, notes, description,
        payout_type, salary_min, salary_max, currency, tags, match_score,
        external_id, posted_at, last_seen)
     VALUES ($1, $2, 'api', $3, $4, 'new', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
     ON CONFLICT (url) WHERE url IS NOT NULL DO UPDATE SET
       last_seen = NOW(),
       match_score = GREATEST(opportunities.match_score, EXCLUDED.match_score)
     RETURNING (xmax = 0) AS inserted`,
    [
      row.title.substring(0, 500),
      row.source,
      row.url,
      row.category || 'remote',
      row.notes || null,
      (row.description || '').substring(0, 2000),
      row.payout_type || null,
      row.salary_min || null,
      row.salary_max || null,
      row.currency || null,
      row.tags || null,
      row.match_score || 0,
      row.external_id || null,
      row.posted_at || null,
    ]
  );
  return r?.inserted || false;
}

// ═══════════════════════════════════════════════════════════
//  REMOTE OK — https://remoteok.com/api
//  JSON, no auth, primera entrada es metadata
// ═══════════════════════════════════════════════════════════
async function fetchRemoteOk() {
  const res = await fetch('https://remoteok.com/api', {
    headers: UA,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`RemoteOK HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('RemoteOK: respuesta inesperada');

  const jobs = data.slice(1); // skip metadata
  let inserted = 0, highScore = 0;
  for (const j of jobs) {
    if (!j.url || !j.position) continue;
    const text = `${j.position} ${j.company || ''} ${j.description || ''} ${(j.tags || []).join(' ')}`;
    const score = await scoreText(text);
    const ok = await insertOpportunity({
      title: `${j.position} @ ${j.company || 'unknown'}`,
      source: 'RemoteOK',
      url: j.url,
      category: 'remote',
      description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 1500),
      payout_type: j.salary_min ? 'fixed' : null,
      salary_min: j.salary_min || null,
      salary_max: j.salary_max || null,
      currency: 'USD',
      tags: j.tags || null,
      match_score: score,
      external_id: `remoteok:${j.id}`,
      posted_at: j.date ? new Date(j.date) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'RemoteOK', total: jobs.length, inserted, highScore };
}

// ═══════════════════════════════════════════════════════════
//  REMOTIVE — https://remotive.com/api/remote-jobs
// ═══════════════════════════════════════════════════════════
async function fetchRemotive() {
  const res = await fetch('https://remotive.com/api/remote-jobs?limit=50', {
    headers: UA,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Remotive HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data.jobs || [];

  let inserted = 0, highScore = 0;
  for (const j of jobs) {
    const text = `${j.title} ${j.company_name || ''} ${j.description || ''} ${(j.tags || []).join(' ')}`;
    const score = await scoreText(text);
    const ok = await insertOpportunity({
      title: `${j.title} @ ${j.company_name || 'unknown'}`,
      source: 'Remotive',
      url: j.url,
      category: j.category || 'remote',
      description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 1500),
      payout_type: 'fixed',
      currency: 'USD',
      tags: j.tags || null,
      match_score: score,
      external_id: `remotive:${j.id}`,
      posted_at: j.publication_date ? new Date(j.publication_date) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'Remotive', total: jobs.length, inserted, highScore };
}

// ═══════════════════════════════════════════════════════════
//  HIMALAYAS — https://himalayas.app/jobs/api
// ═══════════════════════════════════════════════════════════
async function fetchHimalayas() {
  const res = await fetch('https://himalayas.app/jobs/api?limit=50', {
    headers: UA,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Himalayas HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data.jobs || [];

  let inserted = 0, highScore = 0;
  for (const j of jobs) {
    const text = `${j.title} ${j.companyName || ''} ${j.excerpt || ''} ${(j.categories || []).join(' ')}`;
    const score = await scoreText(text);
    const ok = await insertOpportunity({
      title: `${j.title} @ ${j.companyName || 'unknown'}`,
      source: 'Himalayas',
      url: j.applicationLink || `https://himalayas.app${j.jobUrl || ''}`,
      category: 'remote',
      description: (j.excerpt || '').substring(0, 1500),
      payout_type: 'fixed',
      salary_min: j.minSalary || null,
      salary_max: j.maxSalary || null,
      currency: j.currency || 'USD',
      tags: j.categories || null,
      match_score: score,
      external_id: `himalayas:${j.guid || j.id}`,
      posted_at: j.pubDate ? new Date(j.pubDate) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'Himalayas', total: jobs.length, inserted, highScore };
}

// ═══════════════════════════════════════════════════════════
//  JOBICY — https://jobicy.com/api/v2/remote-jobs
// ═══════════════════════════════════════════════════════════
async function fetchJobicy() {
  const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50', {
    headers: UA,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Jobicy HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data.jobs || [];

  let inserted = 0, highScore = 0;
  for (const j of jobs) {
    const text = `${j.jobTitle} ${j.companyName || ''} ${j.jobExcerpt || ''} ${(j.jobIndustry || []).join(' ')}`;
    const score = await scoreText(text);
    const ok = await insertOpportunity({
      title: `${j.jobTitle} @ ${j.companyName || 'unknown'}`,
      source: 'Jobicy',
      url: j.url,
      category: 'remote',
      description: (j.jobExcerpt || '').substring(0, 1500),
      payout_type: 'fixed',
      currency: 'USD',
      tags: j.jobIndustry || null,
      match_score: score,
      external_id: `jobicy:${j.id}`,
      posted_at: j.pubDate ? new Date(j.pubDate) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'Jobicy', total: jobs.length, inserted, highScore };
}

// ═══════════════════════════════════════════════════════════
//  HACKER NEWS WHO'S HIRING — Algolia search API
//  Filtra por "Ask HN: Who is hiring" + remote en últimos 90 días
// ═══════════════════════════════════════════════════════════
async function fetchHnWhoIsHiring() {
  const url = 'https://hn.algolia.com/api/v1/search?query=remote&tags=comment,story_44135013&hitsPerPage=30';
  // story_44135013 es un ID variable; mejor usar tags amplios y filtrar luego
  const altUrl = 'https://hn.algolia.com/api/v1/search_by_date?query=remote&tags=comment&numericFilters=created_at_i>' +
    Math.floor(Date.now() / 1000 - 30 * 86400) + '&hitsPerPage=30';
  const res = await fetch(altUrl, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`HN Algolia HTTP ${res.status}`);
  const data = await res.json();
  const hits = (data.hits || []).filter(h => h.story_title?.toLowerCase().includes('who is hiring'));

  let inserted = 0, highScore = 0;
  for (const h of hits) {
    const text = h.comment_text || '';
    if (!text || text.length < 50) continue;
    const score = await scoreText(text);
    const url = `https://news.ycombinator.com/item?id=${h.objectID}`;
    const title = `HN: ${(text.replace(/<[^>]+>/g, '').substring(0, 100))}`;
    const ok = await insertOpportunity({
      title,
      source: 'HackerNews',
      url,
      category: 'remote',
      description: text.replace(/<[^>]+>/g, '').substring(0, 1500),
      payout_type: 'fixed',
      match_score: score,
      external_id: `hn:${h.objectID}`,
      posted_at: h.created_at ? new Date(h.created_at) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'HackerNews', total: hits.length, inserted, highScore };
}

// ═══════════════════════════════════════════════════════════
//  GITHUB BOUNTY ISSUES — search/issues
//  Busca issues con label "bounty" o que mencionen $$$
// ═══════════════════════════════════════════════════════════
async function fetchGithubBounties() {
  // Sin token, GH API permite 60 req/hr — suficiente para una query
  const q = 'label:bounty state:open language:javascript language:typescript language:python';
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=30`;
  const res = await fetch(url, {
    headers: { ...UA, 'Accept': 'application/vnd.github+json' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  const data = await res.json();
  const items = data.items || [];

  let inserted = 0, highScore = 0;
  for (const i of items) {
    const text = `${i.title} ${i.body || ''}`;
    const score = await scoreText(text);
    const ok = await insertOpportunity({
      title: `[bounty] ${i.title.substring(0, 200)}`,
      source: 'GitHub',
      url: i.html_url,
      category: 'oss-bounty',
      description: (i.body || '').substring(0, 1500),
      payout_type: 'bounty',
      tags: i.labels?.map(l => l.name) || null,
      match_score: score,
      external_id: `gh:${i.id}`,
      posted_at: i.created_at ? new Date(i.created_at) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'GitHub', total: items.length, inserted, highScore };
}

// ═══════════════════════════════════════════════════════════
//  fetchAll — orchestrator con manejo de fallos por fuente
// ═══════════════════════════════════════════════════════════
const FETCHERS = [
  ['RemoteOK', fetchRemoteOk],
  ['Remotive', fetchRemotive],
  ['Himalayas', fetchHimalayas],
  ['Jobicy', fetchJobicy],
  ['HackerNews', fetchHnWhoIsHiring],
  ['GitHub', fetchGithubBounties],
];

async function fetchAll() {
  const results = [];
  let totalInserted = 0;
  let totalHighScore = 0;
  for (const [name, fn] of FETCHERS) {
    try {
      const r = await fn();
      results.push(r);
      totalInserted += r.inserted;
      totalHighScore += r.highScore;
      console.log(`🎯 [${name}] ${r.inserted} new / ${r.total} total · ${r.highScore} high-score`);
      // throttle suave entre APIs
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.warn(`⚠️ [${name}]`, err.message);
      results.push({ source: name, error: err.message });
    }
  }
  return { totalInserted, totalHighScore, bySource: results };
}

module.exports = {
  fetchAll,
  fetchRemoteOk,
  fetchRemotive,
  fetchHimalayas,
  fetchJobicy,
  fetchHnWhoIsHiring,
  fetchGithubBounties,
  scoreText,
};
