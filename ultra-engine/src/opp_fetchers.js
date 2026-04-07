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
  ['DailyRemote', fetchDailyRemote],
  ['Nodesk', fetchNodesk],
  ['Intigriti', fetchIntigriti],
  ['Huntr', fetchHuntr],
  ['GetOnBoard', fetchGetOnBoard],
  ['F6S', fetchF6S],
  ['Euraxess', fetchEuraxess],
  ['SovereignTechFund', fetchSovereignTechFund],
  ['NLnet2', fetchNLnetCalls],
  ['EICAccelerator', fetchEICAccelerator],
  ['HorizonEurope', fetchHorizonEurope],
  ['KitDigitalES', fetchKitDigital],
  ['GarantiaJuvenil', fetchGarantiaJuvenil],
  ['Lablab', fetchLablab],
  ['TorreAI', fetchTorreAI],
  ['IssueHunt', fetchIssueHunt],
  ['Galxe', fetchGalxe],
  ['Layer3', fetchLayer3],
  ['Zealy', fetchZealy],
  ['SolanaColosseum', fetchSolanaColosseum],
  ['Kaggle', fetchKaggle],
  ['ETHGlobal', fetchETHGlobal],
  ['Dework', fetchDework],
  ['FLOSSFund', fetchFLOSSFund],
  ['GitHubFund', fetchGitHubFund],
  ['Clist', fetchClist],
  ['GitHubTrending', fetchGitHubTrending],
  ['Greenhouse', fetchGreenhouse],
  ['GetOnBoardFull', fetchGetOnBoardFull],
  ['DevToHiring', fetchDevToHiring],
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

// Skipped 2026-04-07: immunefi.com/explore/rss/ devuelve HTML wrapper Next.js, no RSS.
// Migración SPA elimina el feed. Cobertura web3 bounty: Algora + Code4rena (también broken)
// + GitHub bounty issues. Para reactivar, usar Puppeteer sidecar contra immunefi.com/explore.
async function fetchImmunefi() {
  return { source: 'Immunefi', total: 0, inserted: 0, highScore: 0, skipped: 'spa_no_rss' };
}

// ═══════════════════════════════════════════════════════════
//  CODE4RENA — audit contests (RSS)
//  https://code4rena.com/feed.xml
// ═══════════════════════════════════════════════════════════
// Skipped 2026-04-07: code4rena.com/feed.xml devuelve HTML wrapper Next.js. Mismo
// problema que Immunefi: SPA migration killed the feed. Audit contest space cubierto
// parcialmente por Devpost + Algora.
async function fetchCode4rena() {
  return { source: 'Code4rena', total: 0, inserted: 0, highScore: 0, skipped: 'spa_no_rss' };
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
// Fix 2026-04-07: /api/bounties devuelve HTML wrapper. La API real (que usa
// el frontend Next.js) es tRPC en /api/trpc/bounty.list. Estructura:
//   [{result:{data:{json:{items:[{id, status, kind, org, task:{title,url}, reward:{amount,currency}, tech, created_at, ...}]}}}}]
async function fetchAlgora() {
  const url = 'https://console.algora.io/api/trpc/bounty.list';
  let res;
  try {
    res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (err) {
    return { source: 'Algora', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
  if (!res.ok) return { source: 'Algora', total: 0, inserted: 0, highScore: 0, error: `HTTP ${res.status}` };
  const data = await res.json().catch(() => null);
  const items = data?.[0]?.result?.data?.json?.items || [];
  let inserted = 0, highScore = 0;
  for (const b of items) {
    const taskUrl = b.task?.url || b.task?.html_url;
    if (!taskUrl) continue;
    const title = b.task?.title || 'Algora bounty';
    const amount = b.reward?.amount || null;
    const currency = b.reward?.currency || 'USD';
    const tech = Array.isArray(b.tech) ? b.tech : [];
    const text = `${title} ${tech.join(' ')}`;
    const score = await scoreText(text);
    const ok = await insertOpportunity({
      title: `${title} ($${amount || '?'} ${currency})`,
      source: 'Algora',
      url: taskUrl,
      category: 'bounty',
      description: tech.join(', ').slice(0, 1500),
      payout_type: 'bounty',
      salary_min: amount, salary_max: amount,
      currency,
      tags: tech.length ? tech : null,
      match_score: score,
      external_id: `algora:${b.id}`,
      posted_at: b.created_at ? new Date(b.created_at) : null,
    });
    if (ok) inserted++;
    if (score >= 8) highScore++;
  }
  return { source: 'Algora', total: items.length, inserted, highScore };
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

// ═══════════════════════════════════════════════════════════
//  Generic RSS-to-opportunity helper
// ═══════════════════════════════════════════════════════════
async function rssOppHelper({ source, url, category = 'remote', tagBase = '' }) {
  try {
    const Parser = require('rss-parser');
    const p = new Parser({ timeout: TIMEOUT, headers: UA });
    const feed = await p.parseURL(url);
    const items = feed.items || [];
    let inserted = 0, highScore = 0;
    for (const it of items.slice(0, 30)) {
      const text = `${it.title || ''} ${it.contentSnippet || ''}`;
      const score = await scoreText(text);
      const ok = await insertOpportunity({
        title: it.title || source,
        source,
        url: it.link,
        category,
        description: (it.contentSnippet || '').slice(0, 1500),
        match_score: score,
        external_id: it.guid || it.link,
        posted_at: it.isoDate ? new Date(it.isoDate) : null,
        tags: tagBase ? [tagBase] : null,
      });
      if (ok) {
        inserted++;
        if (score >= 8) highScore++;
      }
    }
    return { source, total: items.length, inserted, highScore };
  } catch (err) {
    return { source, error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

// Skipped 2026-04-07: dailyremote.com/feed.xml → 403 CF block desde datacenter Hetzner.
// Sin proxy residencial no hay fix. RemoteOK + Remotive + Himalayas cubren el segmento.
async function fetchDailyRemote() {
  return { source: 'DailyRemote', total: 0, inserted: 0, highScore: 0, skipped: 'cf_block_datacenter' };
}
// Skipped 2026-04-07: nodesk.co/remote-jobs/feed/ → 404. RSS removido del sitio.
async function fetchNodesk() {
  return { source: 'Nodesk', total: 0, inserted: 0, highScore: 0, skipped: 'rss_removed' };
}
async function fetchIntigriti() {
  return rssOppHelper({ source: 'Intigriti', url: 'https://blog.intigriti.com/feed/', category: 'bug_bounty', tagBase: 'security' });
}
// Skipped 2026-04-07: huntr.dev/feed.xml → 404. Huntr migró a SPA, RSS eliminado.
// IssueHunt + Algora + GitHub bounties cubren OSS bounty space.
async function fetchHuntr() {
  return { source: 'Huntr', total: 0, inserted: 0, highScore: 0, skipped: 'rss_removed' };
}

// ═══════════════════════════════════════════════════════════
//  GREENHOUSE public Job Board API — boards-api.greenhouse.io
//  No auth, free, 1 endpoint per empresa. Cubre Stripe, Twilio,
//  Cloudflare, Anthropic, Datadog, MongoDB y +14 empresas top.
// ═══════════════════════════════════════════════════════════
const GREENHOUSE_COMPANIES = [
  'stripe', 'twilio', 'cloudflare', 'anthropic', 'datadog', 'mongodb',
  'okta', 'brex', 'airbnb', 'elastic', 'gitlab', 'coinbase', 'reddit',
  'lyft', 'figma', 'instacart', 'pinterest', 'dropbox', 'vercel', 'mercury',
];

async function fetchGreenhouse() {
  let totalFetched = 0, totalIns = 0, totalScore = 0;
  const errors = [];
  for (const company of GREENHOUSE_COMPANIES) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs`, {
        headers: UA,
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!r.ok) { errors.push(`${company}:${r.status}`); continue; }
      const data = await r.json();
      const jobs = data.jobs || [];
      totalFetched += jobs.length;
      for (const j of jobs) {
        if (!j.absolute_url || !j.title) continue;
        const loc = j.location?.name || '';
        const text = `${j.title} ${company} ${loc}`;
        const score = await scoreText(text);
        try {
          const ok = await insertOpportunity({
            title: `${j.title} @ ${company}`.slice(0, 500),
            source: 'Greenhouse',
            url: j.absolute_url,
            category: /remote/i.test(loc) ? 'remote' : 'onsite',
            description: `Company: ${company}. Location: ${loc}`.slice(0, 1500),
            payout_type: 'salary',
            currency: 'USD',
            tags: [company, loc.toLowerCase().includes('remote') ? 'remote' : 'onsite'],
            match_score: score,
            external_id: `gh:${company}:${j.id}`,
            posted_at: j.updated_at ? new Date(j.updated_at) : null,
          });
          if (ok) { totalIns++; if (score >= 8) totalScore++; }
        } catch { /* skip row */ }
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      errors.push(`${company}:${e.message}`);
    }
  }
  return {
    source: 'Greenhouse',
    total: totalFetched,
    inserted: totalIns,
    highScore: totalScore,
    ...(errors.length ? { errors: errors.slice(0, 5) } : {}),
  };
}

// ═══════════════════════════════════════════════════════════
//  GetOnBoard LATAM — public API for remote jobs
//  https://www.getonbrd.com/api/v0/jobs
// ═══════════════════════════════════════════════════════════
// ─── GetOnBoard /jobs FULL feed (OAuth2 client_credentials) ───
// Cuando registres OAuth app en https://www.getonbrd.com/api/oauth/applications
// añade GETONBRD_CLIENT_ID + GETONBRD_CLIENT_SECRET al .env y este fetcher
// hace token bootstrap + paginación completa de TODOS los jobs (no sólo categorías).
let _gobToken = null;
let _gobExpires = 0;

async function fetchGetOnBoardFull() {
  const cid = process.env.GETONBRD_CLIENT_ID;
  const sec = process.env.GETONBRD_CLIENT_SECRET;
  if (!cid || !sec) {
    return { source: 'GetOnBoardFull', total: 0, inserted: 0, highScore: 0, skipped: 'GETONBRD_CLIENT_ID + _SECRET no configurados' };
  }
  try {
    // Token bootstrap
    if (!_gobToken || Date.now() > _gobExpires - 60000) {
      const tr = await fetch('https://www.getonbrd.com/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&client_id=${cid}&client_secret=${sec}`,
        signal: AbortSignal.timeout(15000),
      });
      if (!tr.ok) throw new Error(`OAuth HTTP ${tr.status}`);
      const tdata = await tr.json();
      _gobToken = tdata.access_token;
      _gobExpires = Date.now() + (tdata.expires_in || 7200) * 1000;
    }
    // Pagination loop
    let totalIns = 0, totalScore = 0, totalFetched = 0;
    let page = 1;
    const maxPages = 5;
    while (page <= maxPages) {
      const r = await fetch(`https://www.getonbrd.com/api/v0/jobs?page=${page}&per_page=50`, {
        headers: { Authorization: `Bearer ${_gobToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!r.ok) break;
      const data = await r.json();
      const jobs = data.data || [];
      if (!jobs.length) break;
      totalFetched += jobs.length;
      for (const j of jobs) {
        const a = j.attributes || {};
        const title = a.title || '';
        const company = a.company?.data?.attributes?.long_name || '';
        const score = await scoreText(`${title} ${a.description_headline || ''}`);
        try {
          const ok = await insertOpportunity({
            title: (`${title}${company ? ' @ ' + company : ''}`).slice(0, 500),
            source: 'GetOnBoardFull',
            url: `https://www.getonbrd.com/jobs/${j.id}`,
            category: 'remote',
            description: (a.description_headline || '').slice(0, 1500),
            match_score: score,
            external_id: `gob-full:${j.id}`,
            salary_min: a.min_salary || null, salary_max: a.max_salary || null, currency: 'USD',
            tags: ['latam', 'oauth-full'],
            posted_at: a.published_at ? new Date(a.published_at * 1000) : null,
          });
          if (ok) { totalIns++; if (score >= 8) totalScore++; }
        } catch { /* skip */ }
      }
      if (jobs.length < 50) break;
      page++;
      await new Promise(r => setTimeout(r, 800));
    }
    return { source: 'GetOnBoardFull', total: totalFetched, inserted: totalIns, highScore: totalScore };
  } catch (err) {
    return { source: 'GetOnBoardFull', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

// R5 fix: GetOnBoard endpoint correcto es /api/v0/categories/{cat}/jobs
// (sin auth, public). El endpoint /jobs requería OAuth. Itera categorías relevantes.
async function fetchGetOnBoard() {
  const CATS = ['programming', 'design', 'mobile', 'devops-sysadmin', 'data-science-analytics'];
  let totalIns = 0, totalScore = 0, totalFetched = 0;
  for (const cat of CATS) {
    try {
      const r = await fetch(`https://www.getonbrd.com/api/v0/categories/${cat}/jobs?per_page=20`, {
        headers: { ...UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const jobs = data.data || [];
      totalFetched += jobs.length;
      for (const j of jobs) {
        const a = j.attributes || {};
        const title = a.title || '';
        const company = a.company?.data?.attributes?.long_name || '';
        // a.tags es {data: [...]} JSONAPI relationship, no array. Extraer names si existe.
        const tagNames = Array.isArray(a.tags?.data) ? a.tags.data.map(t => t.attributes?.name || t.id).filter(Boolean) : [];
        const text = `${title} ${a.description_headline || ''} ${tagNames.join(' ')}`;
        const score = await scoreText(text);
        const jobUrl = `https://www.getonbrd.com/jobs/${j.id}`;
        try {
          const ok = await insertOpportunity({
            title: (`${title}${company ? ' @ ' + company : ''}`).slice(0, 500),
            source: 'GetOnBoard',
            url: jobUrl,
            category: 'remote',
            description: (a.description_headline || '').replace(/<[^>]*>/g, '').slice(0, 1500),
            match_score: score,
            external_id: `getonbrd:${j.id}`,
            salary_min: a.min_salary || null, salary_max: a.max_salary || null, currency: 'USD',
            tags: ['latam', cat].concat((a.countries || []).slice(0, 3)),
            posted_at: a.published_at ? new Date(a.published_at * 1000) : null,
          });
          if (ok) { totalIns++; if (score >= 8) totalScore++; }
        } catch (insErr) { /* skip row */ }
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { /* skip cat */ }
  }
  return { source: 'GetOnBoard', total: totalFetched, inserted: totalIns, highScore: totalScore };
}

// ═══════════════════════════════════════════════════════════
//  F6S — startup community RSS
// ═══════════════════════════════════════════════════════════
// Skipped 2026-04-07: f6s.com/feed → 405 Method Not Allowed. Sólo POST aceptado, no RSS público.
async function fetchF6S() {
  return { source: 'F6S', total: 0, inserted: 0, highScore: 0, skipped: 'rss_method_not_allowed' };
}

// ═══════════════════════════════════════════════════════════
//  Euraxess — EU research positions/grants RSS
// ═══════════════════════════════════════════════════════════
// Skipped 2026-04-07: euraxess.ec.europa.eu/jobs/rss.xml → 404.
// Plataforma migró a Drupal SPA con búsqueda interna sin endpoint público.
// EU researcher jobs disponibles vía NLnet calls + GitHubFund + EICAccelerator (cuando funcionen).
async function fetchEuraxess() {
  return { source: 'Euraxess', total: 0, inserted: 0, highScore: 0, skipped: 'rss_removed' };
}

// ═══════════════════════════════════════════════════════════
//  Sovereign Tech Fund — German gov funding for OSS infra
//  Bulletin RSS / Atom feed
// ═══════════════════════════════════════════════════════════
// Skipped 2026-04-07: sovereign.tech/news.xml → 404. Sin RSS público.
// Anuncios via Mastodon @sovtechfund@mastodon.social — añadir a P1 multilingual seed sería opción.
async function fetchSovereignTechFund() {
  return { source: 'SovereignTechFund', total: 0, inserted: 0, highScore: 0, skipped: 'rss_removed' };
}

// ═══════════════════════════════════════════════════════════
//  NLnet — Open Calls (separate from existing fetchNLnet which targets news)
// ═══════════════════════════════════════════════════════════
async function fetchNLnetCalls() {
  return rssOppHelper({ source: 'NLnet-Calls', url: 'https://nlnet.nl/feed.atom', category: 'oss_grant', tagBase: 'oss_funding' });
}

// ═══════════════════════════════════════════════════════════
//  EU EIC Accelerator — startup grants/cascade funding
// ═══════════════════════════════════════════════════════════
// Skipped 2026-04-07: el endpoint /referenceData/grantsTenders.json devuelve metadata
// estática (categorías), no calls activos. Los calls reales sólo accesibles vía SPA con
// state JS. Seed estático con info baseline:
async function fetchEICAccelerator() {
  try {
    const ok = await insertOpportunity({
      title: 'EIC Accelerator — startup grants & equity (EU)',
      source: 'EICAccelerator',
      url: 'https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en',
      category: 'gov_grant',
      description: 'European Innovation Council Accelerator. Hasta €2.5M grant + €15M equity para startups deeptech. Cut-offs trimestrales. Verificar deadlines actuales en el portal antes de aplicar.',
      tags: ['EU', 'gov_grant', 'startup', 'deeptech'],
      external_id: 'eic_accelerator:base',
    });
    return { source: 'EICAccelerator', total: 1, inserted: ok ? 1 : 0, highScore: 0, note: 'static_seed' };
  } catch (err) {
    return { source: 'EICAccelerator', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

// ═══════════════════════════════════════════════════════════
//  Horizon Europe — gigantic EU research programme
// ═══════════════════════════════════════════════════════════
// Skipped 2026-04-07: la URL `?format=atom` del Funding & Tenders Portal devuelve HTML SPA,
// no atom. Igual que EIC: mismo portal sin RSS público real. Seed estático.
async function fetchHorizonEurope() {
  try {
    const ok = await insertOpportunity({
      title: 'Horizon Europe — EU research & innovation framework',
      source: 'HorizonEurope',
      url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-search?frameworkProgramme=43108390',
      category: 'research',
      description: 'Horizon Europe (2021-2027) — €95.5B EU research programme. Calls abiertos en clusters Health/Climate/Digital/Bioeconomy. Buscar en portal por topic ID, deadlines varían.',
      tags: ['EU', 'research', 'horizon_europe'],
      external_id: 'horizon_europe:base',
    });
    return { source: 'HorizonEurope', total: 1, inserted: ok ? 1 : 0, highScore: 0, note: 'static_seed' };
  } catch (err) {
    return { source: 'HorizonEurope', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

// ═══════════════════════════════════════════════════════════
//  Kit Digital ES — Spanish digital transformation grants
//  Sin RSS oficial → seed estático con info actualizable.
// ═══════════════════════════════════════════════════════════
async function fetchKitDigital() {
  try {
    const ok = await insertOpportunity({
      title: 'Kit Digital — Bono digitalización autónomos/PYMES (España)',
      source: 'KitDigitalES',
      url: 'https://www.acelerapyme.gob.es/kit-digital',
      category: 'gov_grant',
      description: 'Programa Next Generation EU. Bonos €2,000-€29,000 para autónomos y PYMES en España. Convocatoria continua hasta agotar fondos.',
      tags: ['ES', 'gov_grant', 'autonomos'],
      external_id: 'kitdigital:base',
    });
    return { source: 'KitDigitalES', total: 1, inserted: ok ? 1 : 0, highScore: 0 };
  } catch (err) {
    return { source: 'KitDigitalES', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

// ═══════════════════════════════════════════════════════════
//  Garantía Juvenil ES — programa empleo joven UE
// ═══════════════════════════════════════════════════════════
async function fetchGarantiaJuvenil() {
  try {
    const ok = await insertOpportunity({
      title: 'Garantía Juvenil — programa empleo y formación <30 (España)',
      source: 'GarantiaJuvenil',
      url: 'https://garantiajuvenil.sepe.es/',
      category: 'gov_program',
      description: 'Sistema Nacional de Garantía Juvenil. Inscripción abierta. Acceso a ofertas de empleo, prácticas, formación y autoempleo subvencionados. Hasta 30 años.',
      tags: ['ES', 'gov_program', 'youth'],
      external_id: 'garantia_juvenil:base',
    });
    return { source: 'GarantiaJuvenil', total: 1, inserted: ok ? 1 : 0, highScore: 0 };
  } catch (err) {
    return { source: 'GarantiaJuvenil', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

// ═══════════════════════════════════════════════════════════
//  Lablab.ai — AI hackathons (RSS via blog)
// ═══════════════════════════════════════════════════════════
// Skipped 2026-04-07: lablab.ai/blog/rss.xml → 403 CF block desde datacenter Hetzner.
// Devpost + ETHGlobal + SolanaColosseum cubren AI hackathon space.
async function fetchLablab() {
  return { source: 'Lablab', total: 0, inserted: 0, highScore: 0, skipped: 'cf_block_datacenter' };
}

// ═══════════════════════════════════════════════════════════
//  Torre.ai — global jobs aggregator (160K+ live opportunities)
//  R5 fix: el body correcto es {and:[{and:[]}]} (POST), trailing slash en URL
//  Endpoint público: search.torre.co/opportunities/_search/?size=N
// ═══════════════════════════════════════════════════════════
async function fetchTorreAI({ size = 30 } = {}) {
  // Torre limita a max 30 per request por User-Agent. Para más usar paginación.
  try {
    const r = await fetch(`https://search.torre.co/opportunities/_search/?size=${size}`, {
      method: 'POST',
      headers: { ...UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ and: [{ and: [] }] }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items = data.results || [];
    let inserted = 0, highScore = 0;
    for (const j of items) {
      const title = j.objective || j.name || '';
      const slug = j.slug || j.id;
      const text = `${title} ${j.tagline || ''} ${(j.skills || []).map(s => s.name || s).join(' ')}`;
      const score = await scoreText(text);
      const comp = j.compensation || {};
      const ok = await insertOpportunity({
        title: title.slice(0, 500),
        source: 'TorreAI',
        url: `https://torre.ai/jobs/${slug || j.id}`,
        category: j.type || 'remote',
        description: (j.tagline || j.objective || '').slice(0, 1500),
        payout_type: comp.periodicity || 'monthly',
        salary_min: comp.minAmount || null,
        salary_max: comp.maxAmount || null,
        currency: (comp.currency || 'USD').slice(0, 3),
        match_score: score,
        external_id: `torre:${j.id}`,
        tags: ['torre', j.type, ...(j.locations || []).map(l => l.name).filter(Boolean)].filter(Boolean).slice(0, 5),
      });
      if (ok) { inserted++; if (score >= 8) highScore++; }
    }
    return { source: 'TorreAI', total: items.length, inserted, highScore };
  } catch (err) {
    return { source: 'TorreAI', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

// ═══════════════════════════════════════════════════════════
//  IssueHunt — OSS bounty platform
// ═══════════════════════════════════════════════════════════
// Skipped 2026-04-07: issuehunt.io/api/v1/issues devuelve HTML SPA, no JSON.
// Sin endpoint público real. Algora + GitHubFund cubren OSS bounty space parcialmente.
async function fetchIssueHunt() {
  return { source: 'IssueHunt', total: 0, inserted: 0, highScore: 0, skipped: 'spa_no_api' };
}

// ═══════════════════════════════════════════════════════════
//  STUBS — keyed (Galxe / Layer3 / Zealy)
//  Set GALXE_API_KEY / LAYER3_API_KEY / ZEALY_API_KEY in .env
// ═══════════════════════════════════════════════════════════
async function fetchGalxe() {
  const key = process.env.GALXE_API_KEY;
  if (!key) return { source: 'Galxe', skipped: 'GALXE_API_KEY no configurada', total: 0, inserted: 0, highScore: 0 };
  try {
    // Galxe GraphQL: needs Authorization header
    const r = await fetch('https://graphigo.prd.galaxy.eco/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access-token': key },
      body: JSON.stringify({
        query: `query { campaigns(input:{first:30,statuses:[Active]}){list{id name description rewardName}}}`,
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const list = data?.data?.campaigns?.list || [];
    let inserted = 0;
    for (const c of list) {
      const ok = await insertOpportunity({
        title: c.name, source: 'Galxe',
        url: `https://galxe.com/quest/${c.id}`,
        category: 'crypto_quest',
        description: (c.description || '').slice(0, 1500),
        external_id: `galxe:${c.id}`,
        tags: ['crypto', 'quest'],
      });
      if (ok) inserted++;
    }
    return { source: 'Galxe', total: list.length, inserted, highScore: 0 };
  } catch (err) {
    return { source: 'Galxe', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

async function fetchLayer3() {
  const key = process.env.LAYER3_API_KEY;
  if (!key) return { source: 'Layer3', skipped: 'LAYER3_API_KEY no configurada', total: 0, inserted: 0, highScore: 0 };
  try {
    const r = await fetch('https://app.layer3.xyz/api/quests', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items = data.quests || data.data || [];
    let inserted = 0;
    for (const q of items) {
      const ok = await insertOpportunity({
        title: q.title || q.name,
        source: 'Layer3',
        url: q.url || `https://app.layer3.xyz/quests/${q.id}`,
        category: 'crypto_quest',
        description: (q.description || '').slice(0, 1500),
        external_id: `layer3:${q.id}`,
        tags: ['crypto', 'quest'],
      });
      if (ok) inserted++;
    }
    return { source: 'Layer3', total: items.length, inserted, highScore: 0 };
  } catch (err) {
    return { source: 'Layer3', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
}

async function fetchZealy() {
  const key = process.env.ZEALY_API_KEY;
  const subdomain = process.env.ZEALY_SUBDOMAIN; // e.g. 'mycommunity'
  if (!key || !subdomain) return { source: 'Zealy', skipped: 'ZEALY_API_KEY+ZEALY_SUBDOMAIN no configurados', total: 0, inserted: 0, highScore: 0 };
  try {
    const r = await fetch(`https://api-v2.zealy.io/public/communities/${subdomain}/quests`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items = data.quests || data || [];
    let inserted = 0;
    for (const q of items) {
      const ok = await insertOpportunity({
        title: q.name,
        source: 'Zealy',
        url: `https://zealy.io/cw/${subdomain}/questboard/${q.id}`,
        category: 'crypto_quest',
        description: (q.description?.text || q.description || '').slice(0, 1500),
        external_id: `zealy:${q.id}`,
        tags: ['crypto', 'quest'],
      });
      if (ok) inserted++;
    }
    return { source: 'Zealy', total: items.length, inserted, highScore: 0 };
  } catch (err) {
    return { source: 'Zealy', error: err.message, total: 0, inserted: 0, highScore: 0 };
  }
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

// ═══════════════════════════════════════════════════════════
//  TIER A round 3 — additional opportunity sources
// ═══════════════════════════════════════════════════════════

// Superteam Earn — Solana ecosystem bounties + grants + projects (free, no auth)
// Replaces broken Solana Colosseum (HTML wrapper). superteam.fun/api/listings devuelve JSON real.
async function fetchSolanaColosseum() {
  try {
    const r = await fetch('https://earn.superteam.fun/api/listings?take=50', {
      headers: UA, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`Superteam HTTP ${r.status}`);
    const items = await r.json();
    let inserted = 0, total = items.length, highScore = 0;
    for (const it of items) {
      const slug = it.slug || it.id;
      const url = `https://earn.superteam.fun/listings/${it.type || 'bounty'}/${slug}`;
      const score = await scoreText(`${it.title} ${it.description || ''}`);
      // currency col is VARCHAR(3): map ERC tokens to closest fiat or 'CRY'
      const tokenRaw = (it.token || 'USDC').toUpperCase();
      const currency = tokenRaw.length <= 3 ? tokenRaw : (tokenRaw.startsWith('USD') ? 'USD' : 'CRY');
      const ok = await insertOpportunity({
        title: it.title,
        source: 'superteam_earn',
        url,
        category: it.type || 'bounty',
        description: (it.description || '').slice(0, 1000),
        payout_type: it.compensationType || 'fixed',
        salary_min: it.minRewardAsk || null,
        salary_max: it.rewardAmount || it.maxRewardAsk || null,
        currency,
        match_score: score,
        external_id: it.id,
        posted_at: it.deadline ? new Date(it.deadline) : null,
      });
      if (ok) { inserted++; if (score >= 8) highScore++; }
    }
    return { source: 'superteam_earn', total, inserted, highScore };
  } catch (err) {
    return { source: 'superteam_earn', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// Kaggle competitions — gated por KAGGLE_USERNAME + KAGGLE_KEY
// Docs: https://www.kaggle.com/docs/api
async function fetchKaggle() {
  const user = process.env.KAGGLE_USERNAME;
  const key = process.env.KAGGLE_KEY;
  if (!user || !key) {
    return { source: 'kaggle', total: 0, inserted: 0, highScore: 0, skipped: 'KAGGLE_USERNAME+KAGGLE_KEY no configurados' };
  }
  try {
    const auth = Buffer.from(`${user}:${key}`).toString('base64');
    const r = await fetch('https://www.kaggle.com/api/v1/competitions/list?category=all', {
      headers: { Authorization: `Basic ${auth}`, ...UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`Kaggle HTTP ${r.status}`);
    const comps = await r.json();
    let inserted = 0, highScore = 0;
    for (const c of (comps || []).slice(0, 50)) {
      const score = await scoreText(`${c.title} ${c.description || ''}`);
      const ok = await insertOpportunity({
        title: c.title,
        source: 'kaggle',
        url: c.url || `https://www.kaggle.com/c/${c.ref}`,
        category: 'competition',
        description: c.description || '',
        payout_type: 'prize',
        salary_max: c.reward ? parseFloat(String(c.reward).replace(/[^\d.]/g, '')) || null : null,
        currency: 'USD',
        match_score: score,
        external_id: String(c.id || c.ref),
      });
      if (ok) { inserted++; if (score >= 8) highScore++; }
    }
    return { source: 'kaggle', total: comps.length, inserted, highScore };
  } catch (err) {
    return { source: 'kaggle', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ETHGlobal hackathons — sin endpoint JSON público.
// Pivot: scrape el HTML Next.js de /events y extrae <a href="/events/SLUG">.
async function fetchETHGlobal() {
  try {
    const r = await fetch('https://ethglobal.com/events', {
      headers: { ...UA, Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`ETHGlobal HTTP ${r.status}`);
    const html = await r.text();
    // Match <a class="..." href="/events/SLUG"> repeated for each event card
    const slugRe = /href="\/events\/([a-z0-9-]+)"/g;
    const slugs = new Set();
    let m;
    while ((m = slugRe.exec(html)) !== null) {
      if (!m[1].includes('/')) slugs.add(m[1]);
    }
    let inserted = 0, highScore = 0;
    for (const slug of slugs) {
      const url = `https://ethglobal.com/events/${slug}`;
      // Title heurística desde slug
      const title = `ETHGlobal ${slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;
      const score = await scoreText(`${title} ethereum hackathon web3 prize`);
      const ok = await insertOpportunity({
        title,
        source: 'ethglobal',
        url,
        category: 'hackathon',
        description: 'ETHGlobal hackathon — verifica detalles en página oficial',
        payout_type: 'prize',
        currency: 'USD',
        match_score: score,
        external_id: `ethglobal:${slug}`,
      });
      if (ok) { inserted++; if (score >= 8) highScore++; }
    }
    return { source: 'ethglobal', total: slugs.size, inserted, highScore };
  } catch (err) {
    return { source: 'ethglobal', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// Dework DAO bounties — gated por DEWORK_API_KEY (GraphQL)
// Docs: https://docs.dework.xyz/api
async function fetchDework() {
  const key = process.env.DEWORK_API_KEY;
  if (!key) {
    return { source: 'dework', total: 0, inserted: 0, highScore: 0, skipped: 'DEWORK_API_KEY no configurada' };
  }
  try {
    const query = `query { tasks(filter: { statuses: [TODO] }, take: 50) { id name description reward { amount token { symbol } } permalink } }`;
    const r = await fetch('https://api.deworkxyz.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...UA },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`Dework HTTP ${r.status}`);
    const data = await r.json();
    const tasks = data?.data?.tasks || [];
    let inserted = 0, highScore = 0;
    for (const t of tasks) {
      const score = await scoreText(`${t.name} ${t.description || ''}`);
      const ok = await insertOpportunity({
        title: t.name,
        source: 'dework',
        url: t.permalink,
        category: 'bounty',
        description: t.description || '',
        payout_type: 'fixed',
        salary_max: t.reward?.amount || null,
        currency: t.reward?.token?.symbol || null,
        match_score: score,
        external_id: t.id,
      });
      if (ok) { inserted++; if (score >= 8) highScore++; }
    }
    return { source: 'dework', total: tasks.length, inserted, highScore };
  } catch (err) {
    return { source: 'dework', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// Skipped 2026-04-07: floss.fund/feed.xml → 404. Sin RSS público en floss.fund.
// Mantener seed estático para que aparezca en /api/opportunities como referencia.
async function fetchFLOSSFund() {
  try {
    const ok = await insertOpportunity({
      title: 'FLOSS/fund — Open Source funding by Zerodha (~$1M/year)',
      source: 'floss_fund',
      url: 'https://floss.fund/',
      category: 'grant',
      description: 'Zerodha\'s grant program for FLOSS projects. ~$1M/year, no equity, applications open year-round. Up to $100K per project. Verifica criterios actuales en floss.fund antes de aplicar.',
      tags: ['oss', 'grant', 'india'],
      external_id: 'floss_fund:base',
    });
    return { source: 'floss_fund', total: 1, inserted: ok ? 1 : 0, highScore: 0, note: 'static_seed' };
  } catch (err) {
    return { source: 'floss_fund', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// GitHub Fund / Sponsorship announcements — blog RSS
async function fetchGitHubFund() {
  try {
    const Parser = require('rss-parser');
    const p = new Parser({ timeout: TIMEOUT, headers: UA });
    const feed = await p.parseURL('https://github.blog/category/open-source/feed/');
    let inserted = 0, highScore = 0;
    for (const it of (feed.items || []).slice(0, 20)) {
      // Filtrar a posts sobre funding/sponsors/grants
      const text = `${it.title} ${it.contentSnippet || ''}`.toLowerCase();
      if (!/(fund|sponsor|grant|accelerator|maintainer)/i.test(text)) continue;
      const score = await scoreText(text);
      const ok = await insertOpportunity({
        title: it.title,
        source: 'github_fund',
        url: it.link,
        category: 'grant',
        description: (it.contentSnippet || '').slice(0, 1000),
        payout_type: 'grant',
        currency: 'USD',
        match_score: score,
        posted_at: it.isoDate ? new Date(it.isoDate) : null,
        external_id: it.guid || it.link,
      });
      if (ok) { inserted++; if (score >= 8) highScore++; }
    }
    return { source: 'github_fund', total: (feed.items || []).length, inserted, highScore };
  } catch (err) {
    return { source: 'github_fund', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  TIER A round 4 — clist.by + GitHub Trending
// ═══════════════════════════════════════════════════════════

// clist.by — programming contest aggregator (free tier with API key)
// Docs: https://clist.by/api/v4/doc/
async function fetchClist() {
  const user = process.env.CLIST_USERNAME;
  const key = process.env.CLIST_API_KEY;
  if (!user || !key) {
    return { source: 'clist', total: 0, inserted: 0, highScore: 0, skipped: 'CLIST_USERNAME+CLIST_API_KEY no configurados' };
  }
  try {
    const url = `https://clist.by/api/v4/contest/?username=${encodeURIComponent(user)}&api_key=${key}&upcoming=true&limit=50&order_by=start`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`Clist HTTP ${r.status}`);
    const data = await r.json();
    const contests = data.objects || [];
    let inserted = 0, highScore = 0;
    for (const c of contests) {
      const score = await scoreText(`${c.event} ${c.host || ''}`);
      const ok = await insertOpportunity({
        title: c.event,
        source: 'clist',
        url: c.href,
        category: 'contest',
        description: `Host: ${c.host} · Duration ${Math.round((c.duration || 0) / 60)}min`,
        payout_type: 'prize',
        match_score: score,
        external_id: String(c.id),
        posted_at: c.start ? new Date(c.start) : null,
      });
      if (ok) { inserted++; if (score >= 8) highScore++; }
    }
    return { source: 'clist', total: contests.length, inserted, highScore };
  } catch (err) {
    return { source: 'clist', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// GitHub Trending — scrape free no-auth de github.com/trending
// Útil como source de OSS projects con momentum (potencial bounty/contribute)
async function fetchGitHubTrending() {
  try {
    const cheerio = require('cheerio');
    const langs = ['', 'javascript', 'typescript', 'python', 'rust', 'go'];
    let inserted = 0, total = 0, highScore = 0;
    for (const lang of langs) {
      try {
        const url = `https://github.com/trending/${lang}?since=daily`;
        const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
        if (!r.ok) continue;
        const html = await r.text();
        const $ = cheerio.load(html);
        const repos = [];
        $('article.Box-row').each((_, el) => {
          const $el = $(el);
          const a = $el.find('h2 a');
          const href = a.attr('href') || '';
          const repoName = href.replace(/^\//, '').trim();
          if (!repoName) return;
          const desc = $el.find('p').text().trim();
          const stars = $el.find('a[href$="/stargazers"]').first().text().trim();
          repos.push({ repoName, desc, stars, href });
        });
        for (const repo of repos) {
          total++;
          const text = `${repo.repoName} ${repo.desc}`;
          const score = await scoreText(text);
          const ok = await insertOpportunity({
            title: `[Trending${lang ? `/${lang}` : ''}] ${repo.repoName}`,
            source: 'github_trending',
            url: `https://github.com${repo.href}`,
            category: 'oss_project',
            description: repo.desc,
            payout_type: 'bounty',
            match_score: score,
            external_id: `gh-trending:${repo.repoName}`,
            tags: lang ? [lang] : null,
          });
          if (ok) { inserted++; if (score >= 8) highScore++; }
        }
        await new Promise(r => setTimeout(r, 1000)); // throttle
      } catch (e) { /* skip lang */ }
    }
    return { source: 'github_trending', total, inserted, highScore };
  } catch (err) {
    return { source: 'github_trending', total: 0, inserted: 0, highScore: 0, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  R4 P5 — DEV.to articles tagged hiring/remotework
//  https://dev.to/api/articles?tag={tag}&top={days} (free, no auth)
//  Filtra a posts publicados en últimos 30 días para evitar listicles antiguos.
// ═══════════════════════════════════════════════════════════
async function fetchDevToHiring() {
  const tags = ['hiring', 'remote', 'remotework', 'jobs'];
  let totalFetched = 0, inserted = 0, highScore = 0;
  const cutoff = Date.now() - 30 * 86400000; // últimos 30 días

  for (const tag of tags) {
    try {
      const r = await fetch(`https://dev.to/api/articles?tag=${tag}&per_page=30`, {
        headers: { ...UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!r.ok) continue;
      const arr = await r.json();
      if (!Array.isArray(arr)) continue;
      totalFetched += arr.length;
      for (const a of arr) {
        const pubMs = new Date(a.published_at || 0).getTime();
        if (pubMs < cutoff) continue;  // skip stale
        const title = (a.title || '').slice(0, 500);
        const text = `${title} ${a.description || ''} ${(a.tag_list || []).join(' ')}`;
        // Filtro de calidad: descarta listicles "Top X" puros si no mencionan job/hire
        if (/top \d+/i.test(title) && !/hir|job|career|appl/i.test(text)) continue;
        const score = await scoreText(text);
        const ok = await insertOpportunity({
          title,
          source: 'dev.to',
          url: a.url || a.canonical_url,
          category: 'remote',
          description: (a.description || '').slice(0, 1500),
          match_score: score,
          external_id: `devto:${a.id}`,
          tags: a.tag_list || null,
          posted_at: a.published_at ? new Date(a.published_at) : null,
        });
        if (ok) { inserted++; if (score >= 8) highScore++; }
      }
      await new Promise(r => setTimeout(r, 500));
    } catch { /* skip tag */ }
  }
  return { source: 'devto', total: totalFetched, inserted, highScore };
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
  fetchDailyRemote,
  fetchNodesk,
  fetchIntigriti,
  fetchHuntr,
  fetchGetOnBoard,
  fetchF6S,
  fetchEuraxess,
  fetchSovereignTechFund,
  fetchNLnetCalls,
  fetchEICAccelerator,
  fetchHorizonEurope,
  fetchKitDigital,
  fetchGarantiaJuvenil,
  fetchLablab,
  fetchTorreAI,
  fetchIssueHunt,
  fetchGalxe,
  fetchLayer3,
  fetchZealy,
  fetchSolanaColosseum,
  fetchKaggle,
  fetchETHGlobal,
  fetchDework,
  fetchFLOSSFund,
  fetchGitHubFund,
  fetchClist,
  fetchGitHubTrending,
  fetchGetOnBoardFull,
  fetchGreenhouse,
  fetchDevToHiring,
  scoreText,
};
