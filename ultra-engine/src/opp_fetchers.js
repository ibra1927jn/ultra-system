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
  ['Algora', fetchAlgora],
  ['JobSpyRemote', fetchJobSpyRemote],
  ['Immunefi', fetchImmunefi],
  ['Code4rena', fetchCode4rena],
  ['Devpost', fetchDevpost],
  ['NLnet', fetchNLnet],
  ['Codeforces', fetchCodeforces],
  ['Unstop', fetchUnstop],
  ['WeWorkRemotely', fetchWeWorkRemotely],
  ['CTFtime', fetchCTFtime],
  ['CodeChef', fetchCodeChef],
];

// ═══════════════════════════════════════════════════════════
//  WE WORK REMOTELY — RSS programming jobs
// ═══════════════════════════════════════════════════════════
async function fetchWeWorkRemotely() {
  try {
    const feed = await _parser.parseURL('https://weworkremotely.com/categories/remote-programming-jobs.rss');
    const items = feed.items || [];
    let inserted = 0, highScore = 0;
    for (const it of items.slice(0, 50)) {
      const text = `${it.title} ${it.contentSnippet || ''}`;
      const score = await scoreText(text);
      const ok = await insertOpportunity({
        title: it.title,
        source: 'WeWorkRemotely',
        url: it.link,
        category: 'remote',
        description: (it.contentSnippet || '').slice(0, 1500),
        payout_type: 'salary',
        currency: 'USD',
        tags: ['remote', 'programming'],
        match_score: score,
        external_id: `wwr:${it.guid || it.link}`,
        posted_at: it.isoDate ? new Date(it.isoDate) : null,
      });
      if (ok) inserted++;
      if (score >= 8) highScore++;
    }
    return { source: 'WeWorkRemotely', total: items.length, inserted, highScore };
  } catch (err) {
    return { source: 'WeWorkRemotely', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  CTFTIME — Capture The Flag events
// ═══════════════════════════════════════════════════════════
async function fetchCTFtime() {
  try {
    const r = await fetch('https://ctftime.org/api/v1/events/?limit=20', {
      headers: { ...UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const events = await r.json();
    let inserted = 0;
    for (const ev of events) {
      const text = `${ev.title} ${ev.description || ''}`;
      const score = await scoreText(text);
      const ok = await insertOpportunity({
        title: `${ev.title} (CTF)`,
        source: 'CTFtime',
        url: ev.url || `https://ctftime.org/event/${ev.id}`,
        category: 'ctf',
        description: (ev.description || '').slice(0, 1500),
        payout_type: 'rating',
        currency: 'USD',
        tags: ['security', 'ctf', ev.format].filter(Boolean),
        match_score: score,
        external_id: `ctftime:${ev.id}`,
        posted_at: ev.start ? new Date(ev.start) : null,
      });
      if (ok) inserted++;
    }
    return { source: 'CTFtime', total: events.length, inserted, highScore: 0 };
  } catch (err) {
    return { source: 'CTFtime', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  CODECHEF — programming contests
// ═══════════════════════════════════════════════════════════
async function fetchCodeChef() {
  try {
    const r = await fetch('https://www.codechef.com/api/list/contests/all', {
      headers: { ...UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const future = data.future_contests || [];
    let inserted = 0;
    for (const c of future) {
      const ok = await insertOpportunity({
        title: c.contest_name,
        source: 'CodeChef',
        url: `https://www.codechef.com/${c.contest_code}`,
        category: 'algo_contest',
        description: `Starts ${c.contest_start_date}, ends ${c.contest_end_date}`,
        payout_type: 'rating',
        currency: 'INR',
        tags: ['algorithm', 'codechef'],
        match_score: await scoreText(c.contest_name),
        external_id: `codechef:${c.contest_code}`,
        posted_at: c.contest_start_date_iso ? new Date(c.contest_start_date_iso) : null,
      });
      if (ok) inserted++;
    }
    return { source: 'CodeChef', total: future.length, inserted, highScore: 0 };
  } catch (err) {
    return { source: 'CodeChef', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  CODEFORCES — algorithmic competitions (JSON API)
// ═══════════════════════════════════════════════════════════
async function fetchCodeforces() {
  try {
    const r = await fetch('https://codeforces.com/api/contest.list', {
      headers: UA, signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.status !== 'OK') throw new Error('API status not OK');
    // Solo procesa upcoming (phase=BEFORE)
    const upcoming = (data.result || []).filter(c => c.phase === 'BEFORE').slice(0, 30);
    let inserted = 0;
    for (const c of upcoming) {
      const startMs = c.startTimeSeconds * 1000;
      const ok = await insertOpportunity({
        title: c.name,
        source: 'Codeforces',
        url: `https://codeforces.com/contest/${c.id}`,
        category: 'algo_contest',
        description: `${c.type} contest, ${Math.round(c.durationSeconds / 60)} min duration. Starts ${new Date(startMs).toISOString()}`,
        payout_type: 'rating',
        currency: null,
        tags: ['algorithm', 'competitive_programming', c.type?.toLowerCase()].filter(Boolean),
        match_score: await scoreText(c.name),
        external_id: `cf:${c.id}`,
        posted_at: new Date(startMs),
      });
      if (ok) inserted++;
    }
    return { source: 'Codeforces', total: upcoming.length, inserted, highScore: 0 };
  } catch (err) {
    return { source: 'Codeforces', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  UNSTOP — India hackathons (JSON API)
// ═══════════════════════════════════════════════════════════
async function fetchUnstop() {
  try {
    const r = await fetch('https://unstop.com/api/public/opportunity/search-result', {
      headers: UA, signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items = data.data?.data || [];
    let inserted = 0, highScore = 0;
    for (const it of items) {
      // Solo hackathons + opportunities con regn_open
      if (!it.regn_open) continue;
      // Strip HTML
      const desc = (it.details || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500);
      const text = `${it.title} ${desc}`;
      const score = await scoreText(text);
      const ok = await insertOpportunity({
        title: it.title,
        source: 'Unstop',
        url: `https://unstop.com/${it.public_url}`,
        category: it.type === 'hackathons' ? 'hackathon' : 'competition',
        description: desc,
        payout_type: 'prize',
        currency: 'INR',
        tags: [it.type, it.subtype, it.region].filter(Boolean),
        match_score: score,
        external_id: `unstop:${it.id}`,
        posted_at: it.updated_at ? new Date(it.updated_at) : null,
      });
      if (ok) inserted++;
      if (score >= 8) highScore++;
    }
    return { source: 'Unstop', total: items.length, inserted, highScore };
  } catch (err) {
    return { source: 'Unstop', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  IMMUNEFI — bug bounties Web3 (RSS público)
//  https://immunefi.com/explore/rss/
// ═══════════════════════════════════════════════════════════
const Parser = require('rss-parser');
const _parser = new Parser({ timeout: 15000 });

async function fetchImmunefi() {
  try {
    const feed = await _parser.parseURL('https://immunefi.com/explore/rss/');
    const items = feed.items || [];
    let inserted = 0, highScore = 0;
    for (const it of items) {
      const text = `${it.title} ${it.contentSnippet || ''}`;
      const score = await scoreText(text);
      // Try to extract reward from title (e.g. "$50,000 — Foo Protocol")
      const rewardMatch = (it.title || '').match(/\$\s*([\d,]+(?:\.\d+)?)\s*(K|M)?/i);
      let salary = null;
      if (rewardMatch) {
        salary = parseFloat(rewardMatch[1].replace(/,/g, ''));
        if (rewardMatch[2]?.toUpperCase() === 'K') salary *= 1000;
        if (rewardMatch[2]?.toUpperCase() === 'M') salary *= 1000000;
      }
      const ok = await insertOpportunity({
        title: it.title || 'Immunefi bounty',
        source: 'Immunefi',
        url: it.link,
        category: 'bounty',
        description: (it.contentSnippet || '').slice(0, 1500),
        payout_type: 'bounty',
        salary_min: salary,
        salary_max: salary,
        currency: 'USD',
        tags: ['web3', 'security'],
        match_score: score,
        external_id: `immunefi:${it.guid || it.link}`,
        posted_at: it.isoDate ? new Date(it.isoDate) : null,
      });
      if (ok) inserted++;
      if (score >= 8) highScore++;
    }
    return { source: 'Immunefi', total: items.length, inserted, highScore };
  } catch (err) {
    return { source: 'Immunefi', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  CODE4RENA — audit contests (RSS)
//  https://code4rena.com/feed.xml
// ═══════════════════════════════════════════════════════════
async function fetchCode4rena() {
  try {
    const feed = await _parser.parseURL('https://code4rena.com/feed.xml');
    const items = feed.items || [];
    let inserted = 0, highScore = 0;
    for (const it of items) {
      const text = `${it.title} ${it.contentSnippet || ''}`;
      const score = await scoreText(text);
      const ok = await insertOpportunity({
        title: it.title || 'C4 audit contest',
        source: 'Code4rena',
        url: it.link,
        category: 'audit_contest',
        description: (it.contentSnippet || '').slice(0, 1500),
        payout_type: 'contest',
        currency: 'USD',
        tags: ['solidity', 'audit', 'web3'],
        match_score: score,
        external_id: `c4:${it.guid || it.link}`,
        posted_at: it.isoDate ? new Date(it.isoDate) : null,
      });
      if (ok) inserted++;
      if (score >= 8) highScore++;
    }
    return { source: 'Code4rena', total: items.length, inserted, highScore };
  } catch (err) {
    return { source: 'Code4rena', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  DEVPOST — hackathons (JSON API)
//  https://devpost.com/api/hackathons
// ═══════════════════════════════════════════════════════════
async function fetchDevpost() {
  try {
    const r = await fetch('https://devpost.com/api/hackathons', {
      headers: { ...UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const hacks = data.hackathons || [];
    let inserted = 0, highScore = 0;
    for (const h of hacks) {
      const text = `${h.title} ${(h.themes || []).map(t => t.name).join(' ')}`;
      const score = await scoreText(text);
      const prizeMatch = (h.prize_amount || '').match(/\$\s*([\d,]+)/);
      const prize = prizeMatch ? parseFloat(prizeMatch[1].replace(/,/g, '')) : null;
      const ok = await insertOpportunity({
        title: h.title,
        source: 'Devpost',
        url: h.url,
        category: 'hackathon',
        description: `${h.organization_name || ''} · ${h.submission_period_dates || ''}`,
        payout_type: 'prize',
        salary_min: prize,
        salary_max: prize,
        currency: 'USD',
        tags: (h.themes || []).map(t => t.name),
        match_score: score,
        external_id: `devpost:${h.id}`,
        posted_at: null,
      });
      if (ok) inserted++;
      if (score >= 8) highScore++;
    }
    return { source: 'Devpost', total: hacks.length, inserted, highScore };
  } catch (err) {
    return { source: 'Devpost', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  NLNET — open-source grants (Atom feed)
//  https://nlnet.nl/feed.atom
// ═══════════════════════════════════════════════════════════
async function fetchNLnet() {
  try {
    const feed = await _parser.parseURL('https://nlnet.nl/feed.atom');
    const items = feed.items || [];
    let inserted = 0, highScore = 0;
    for (const it of items.slice(0, 30)) {  // limit since feed is huge
      const text = `${it.title} ${it.contentSnippet || ''}`;
      // Solo procesa items con keywords grant/funding/open-call
      if (!/grant|fund|call|open call/i.test(text)) continue;
      const score = await scoreText(text);
      const ok = await insertOpportunity({
        title: it.title || 'NLnet grant',
        source: 'NLnet',
        url: it.link,
        category: 'grant',
        description: (it.contentSnippet || '').slice(0, 1500),
        payout_type: 'grant',
        currency: 'EUR',
        tags: ['open-source', 'eu'],
        match_score: score,
        external_id: `nlnet:${it.guid || it.link}`,
        posted_at: it.isoDate ? new Date(it.isoDate) : null,
      });
      if (ok) inserted++;
      if (score >= 8) highScore++;
    }
    return { source: 'NLnet', total: items.length, inserted, highScore };
  } catch (err) {
    return { source: 'NLnet', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  ALGORA — bounties marketplace (P5 Fase 2)
//  Public bounties endpoint en console.algora.io
// ═══════════════════════════════════════════════════════════
async function fetchAlgora() {
  const url = 'https://console.algora.io/api/bounties?status=open&limit=50';
  let res;
  try {
    res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (err) {
    return { source: 'Algora', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
  if (!res.ok) return { source: 'Algora', total: 0, inserted: 0, highScore: 0, error: `HTTP ${res.status}` };
  const data = await res.json().catch(() => null);
  const bounties = (data?.bounties || data?.data || data || []);
  let inserted = 0, highScore = 0;
  for (const b of (Array.isArray(bounties) ? bounties : [])) {
    if (!b.url && !b.html_url) continue;
    const text = `${b.title || ''} ${b.description || ''} ${(b.tech || []).join(' ')}`;
    const score = await scoreText(text);
    const ok = await insertOpportunity({
      title: `${b.title || 'Algora bounty'} ($${b.amount || b.reward || '?'})`,
      source: 'Algora',
      url: b.url || b.html_url,
      category: 'bounty',
      description: (b.description || '').slice(0, 1500),
      payout_type: 'bounty',
      salary_min: b.amount || b.reward || null,
      salary_max: b.amount || b.reward || null,
      currency: 'USD',
      tags: b.tech || null,
      match_score: score,
      external_id: `algora:${b.id}`,
      posted_at: b.created_at ? new Date(b.created_at) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'Algora', total: bounties.length, inserted, highScore };
}

// ═══════════════════════════════════════════════════════════
//  JOBSPY (Python sidecar) — remote subset (P5 Fase 2)
//  Llama al container ultra_jobspy:8000/api/v1/search_jobs
// ═══════════════════════════════════════════════════════════
async function fetchJobSpyRemote() {
  const baseUrl = process.env.JOBSPY_BASE_URL || 'http://jobspy:8000';
  // Multi-site: linkedin (sin country), indeed (con country=worldwide proxy)
  const url = `${baseUrl}/api/v1/search_jobs?site_name=linkedin&search_term=remote+software+engineer&results_wanted=20&hours_old=72`;
  let res;
  try {
    res = await fetch(url, { headers: { ...UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  } catch (err) {
    return { source: 'JobSpyRemote', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
  if (!res.ok) return { source: 'JobSpyRemote', total: 0, inserted: 0, highScore: 0, error: `HTTP ${res.status}` };
  const data = await res.json().catch(() => ({}));
  const jobs = data.jobs || data.results || [];
  let inserted = 0, highScore = 0;
  for (const j of jobs) {
    const text = `${j.title || ''} ${j.company || ''} ${j.description || ''}`;
    if (!j.job_url) continue;
    // jobspy puede devolver onsite — solo aceptamos remote
    const isRemote = /\bremote\b/i.test(`${j.title || ''} ${j.location || ''} ${j.is_remote || ''}`);
    if (!isRemote) continue;
    const score = await scoreText(text);
    const ok = await insertOpportunity({
      title: `${j.title} @ ${j.company || 'unknown'}`,
      source: `JobSpy:${j.site || '?'}`,
      url: j.job_url,
      category: 'remote',
      description: (j.description || '').slice(0, 1500),
      payout_type: 'salary',
      salary_min: j.min_amount || null,
      salary_max: j.max_amount || null,
      currency: j.currency || 'USD',
      tags: null,
      match_score: score,
      external_id: `jobspy:${j.id || j.job_url}`,
      posted_at: j.date_posted ? new Date(j.date_posted) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'JobSpyRemote', total: jobs.length, inserted, highScore };
}

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
  fetchAlgora,
  fetchJobSpyRemote,
  fetchImmunefi,
  fetchCode4rena,
  fetchDevpost,
  fetchNLnet,
  fetchCodeforces,
  fetchUnstop,
  fetchWeWorkRemotely,
  fetchCTFtime,
  fetchCodeChef,
  scoreText,
};
