// ════════════════════════════════════════════════════════════
//  WM GDELT Intel — Phase 2 Step 12
//
//  Reemplaza el cron legacy `gdelt-fetch` (news_apis.fetchGdelt) que
//  alternaba HTTP 429 / fetch failed / timeout.
//
//  Estrategia:
//   - 24 topic queries que cubren el espectro completo de GDELT DOC 2.0
//     (military, cyber, nuclear, sanctions, intelligence, maritime,
//      economy, climate, protests, terrorism, migration, energy,
//      health, technology, space, elections, diplomacy, trade, finance,
//      disasters, human_rights, food_security, water, ai_policy)
//   - Stagger 6s entre topics (24 × 6s ≈ 2.5min por run completa)
//   - Retry exponencial con jitter en 429 / 5xx / network err (3 attempts)
//   - User-Agent realista (Chrome) — UltraSystem/1.0 era trigger seguro de 429
//   - Persiste en wm_intel_articles vía bridge job
//   - Cleanup retention 7d
//
//  Llamado por wm_bridge.runWmGdeltIntelJob() desde scheduler cron
//  `wm-gdelt-intel` (each :17 every 30 min).
// ════════════════════════════════════════════════════════════

'use strict';

const throttle = require('./gdelt_throttle');

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Tuning notes:
//  - 24 topics split into 6 GROUPS of 4, scheduled every 10 min.
//  - Since 2026-04-10 the inter-request pacing is enforced by the
//    shared `gdelt_throttle` module instead of an internal STAGGER_MS.
//    The throttle coordinates with wm_gdelt_geo so that both callers
//    respect a single process-wide GDELT rate bucket.
//  - Retry is kept for transient failures; on 429/non-json the
//    throttle's global cooldown absorbs the recovery window.
const MAX_RECORDS = 20;
const TIMESPAN = '24h';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

// ─── Topic catalog — covers full GDELT spectrum ──────────────
// Each query uses GDELT boolean operators with `sourcelang:eng`
// to constrain to English sources (multilingual would 4x the
// duplicate dedupe load downstream and most consumers want EN).
const INTEL_TOPICS = [
  {
    id: 'military',
    name: 'Military Activity',
    icon: '⚔️',
    query: '(military exercise OR troop deployment OR airstrike OR "naval exercise" OR mobilization) sourcelang:eng',
  },
  {
    id: 'cyber',
    name: 'Cyber Threats',
    icon: '🔓',
    query: '(cyberattack OR ransomware OR hacking OR "data breach" OR APT OR "zero day") sourcelang:eng',
  },
  {
    id: 'nuclear',
    name: 'Nuclear',
    icon: '☢️',
    query: '(nuclear OR "uranium enrichment" OR IAEA OR "nuclear weapon" OR plutonium OR "atomic test") sourcelang:eng',
  },
  {
    id: 'sanctions',
    name: 'Sanctions',
    icon: '🚫',
    query: '(sanctions OR embargo OR "trade war" OR "export control" OR "secondary sanctions") sourcelang:eng',
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    icon: '🕵️',
    query: '(espionage OR spy OR "intelligence agency" OR covert OR surveillance OR "double agent") sourcelang:eng',
  },
  {
    id: 'maritime',
    name: 'Maritime Security',
    icon: '🚢',
    query: '("naval blockade" OR piracy OR "strait of hormuz" OR "south china sea" OR warship OR "freedom of navigation") sourcelang:eng',
  },
  {
    id: 'economy',
    name: 'Economy',
    icon: '📉',
    query: '(recession OR inflation OR "central bank" OR GDP OR unemployment OR "economic crisis") sourcelang:eng',
  },
  {
    id: 'climate',
    name: 'Climate',
    icon: '🌡️',
    query: '("climate change" OR drought OR flood OR "extreme weather" OR heatwave OR "carbon emissions") sourcelang:eng',
  },
  {
    id: 'protests',
    name: 'Protests & Unrest',
    icon: '✊',
    query: '(protest OR riot OR demonstration OR "civil unrest" OR strike OR uprising) sourcelang:eng',
  },
  {
    id: 'terrorism',
    name: 'Terrorism',
    icon: '💣',
    query: '("terrorist attack" OR bombing OR "suicide attack" OR ISIS OR hostage OR "car bomb") sourcelang:eng',
  },
  {
    id: 'migration',
    name: 'Migration',
    icon: '🌍',
    query: '(migration OR refugee OR asylum OR "border crisis" OR "migrant caravan" OR displaced) sourcelang:eng',
  },
  {
    id: 'energy',
    name: 'Energy',
    icon: '⛽',
    query: '("oil price" OR OPEC OR "natural gas" OR pipeline OR "energy crisis" OR LNG) sourcelang:eng',
  },
  {
    id: 'health',
    name: 'Health & Pandemics',
    icon: '🦠',
    query: '(epidemic OR outbreak OR pandemic OR virus OR WHO OR "disease X") sourcelang:eng',
  },
  {
    id: 'technology',
    name: 'Technology',
    icon: '💻',
    query: '("artificial intelligence" OR semiconductor OR "chip ban" OR quantum OR "tech breakthrough") sourcelang:eng',
  },
  {
    id: 'space',
    name: 'Space',
    icon: '🚀',
    query: '(satellite OR "rocket launch" OR SpaceX OR ISS OR asteroid OR "space race") sourcelang:eng',
  },
  {
    id: 'elections',
    name: 'Elections & Politics',
    icon: '🗳️',
    query: '(election OR coup OR "regime change" OR parliament OR referendum OR "vote count") sourcelang:eng',
  },
  {
    id: 'diplomacy',
    name: 'Diplomacy',
    icon: '🤝',
    query: '("diplomatic summit" OR treaty OR ambassador OR "state visit" OR "peace talks") sourcelang:eng',
  },
  {
    id: 'trade',
    name: 'Trade & Supply Chain',
    icon: '📦',
    query: '("supply chain" OR port OR shipping OR container OR tariff OR "trade deal") sourcelang:eng',
  },
  {
    id: 'finance',
    name: 'Finance & Markets',
    icon: '💰',
    query: '("stock market" OR "market crash" OR "banking crisis" OR cryptocurrency OR "interest rate") sourcelang:eng',
  },
  {
    id: 'disasters',
    name: 'Natural Disasters',
    icon: '🌪️',
    query: '(earthquake OR tsunami OR hurricane OR volcano OR wildfire OR landslide) sourcelang:eng',
  },
  {
    id: 'human_rights',
    name: 'Human Rights',
    icon: '⚖️',
    query: '("human rights" OR genocide OR ICC OR "war crime" OR torture OR "ethnic cleansing") sourcelang:eng',
  },
  {
    id: 'food_security',
    name: 'Food Security',
    icon: '🌾',
    query: '("food security" OR famine OR harvest OR grain OR "food crisis" OR "wheat shortage") sourcelang:eng',
  },
  {
    id: 'water',
    name: 'Water',
    icon: '💧',
    query: '("water crisis" OR "water scarcity" OR dam OR reservoir OR "river dispute") sourcelang:eng',
  },
  {
    id: 'ai_policy',
    name: 'AI Policy',
    icon: '🤖',
    query: '("AI regulation" OR "EU AI Act" OR OpenAI OR "model release" OR "AI safety") sourcelang:eng',
  },
];

function getIntelTopics() {
  return INTEL_TOPICS.slice();
}

// ─── Topic groups for staggered cron scheduling ──────────────
// Six groups of 4 topics each. Each group is one cron run, scheduled
// every 10 minutes. All 24 topics covered every hour, but instantaneous
// load is 4 topics × 12s stagger (~48s + retries) instead of 8.
// Smoke runs with groups of 8 produced 6/8 GDELT 429 / fetch failed
// even with 12s stagger; smaller groups are kinder to GDELT's IP rate
// limit and let each cron run finish well within its 10-min slot.
const TOPIC_GROUPS = {
  a: ['military', 'cyber', 'nuclear', 'sanctions'],
  b: ['intelligence', 'maritime', 'economy', 'climate'],
  c: ['protests', 'terrorism', 'migration', 'energy'],
  d: ['health', 'technology', 'space', 'elections'],
  e: ['diplomacy', 'trade', 'finance', 'disasters'],
  f: ['human_rights', 'food_security', 'water', 'ai_policy'],
};

function getTopicsForGroup(group) {
  const ids = TOPIC_GROUPS[group];
  if (!ids) throw new Error(`Unknown topic group: ${group}`);
  const byId = new Map(INTEL_TOPICS.map(t => [t.id, t]));
  return ids.map(id => {
    const t = byId.get(id);
    if (!t) throw new Error(`Topic group "${group}" references unknown id: ${id}`);
    return t;
  });
}

// GDELT seendate format: '20260407T123000Z'
function parseSeendate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Fetch one topic from GDELT DOC 2.0 with retry/backoff.
 * Returns { topic, articles, error }.
 *
 * Retry only on 429 / 5xx / network failures. 4xx other than 429
 * means our query is malformed and retrying won't help.
 */
async function fetchTopic(topic) {
  const url = new URL(GDELT_DOC_API);
  url.searchParams.set('query', topic.query);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('maxrecords', String(MAX_RECORDS));
  url.searchParams.set('format', 'json');
  url.searchParams.set('sort', 'datedesc');
  url.searchParams.set('timespan', TIMESPAN);

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Wait on the shared GDELT gate. Serializes with wm_gdelt_geo.
    await throttle.acquire();
    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`GDELT HTTP ${res.status}`);
        throttle.reportThrottled(); // global cooldown
        continue;
      }

      if (!res.ok) {
        return { topic, articles: [], error: `HTTP ${res.status}` };
      }

      // GDELT sometimes returns content-type text/plain with JSON inside
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // GDELT returned non-JSON — treat as throttling signal and
        // bail to retry via global cooldown.
        lastErr = new Error('non-json response (likely throttled)');
        throttle.reportThrottled();
        if (attempt < MAX_ATTEMPTS) continue;
        return { topic, articles: [], error: 'non-json response' };
      }

      const raw = Array.isArray(data?.articles) ? data.articles : [];
      const articles = raw
        .filter(a => a && a.url && a.title)
        .map(a => ({
          title: String(a.title).slice(0, 1000),
          url: String(a.url),
          source: String(a.domain || a.source?.domain || '').slice(0, 200),
          seendate: parseSeendate(a.seendate),
          language: a.language ? String(a.language).slice(0, 20) : null,
          tone: typeof a.tone === 'number' && isFinite(a.tone) ? a.tone : null,
          image: a.socialimage ? String(a.socialimage).slice(0, 1000) : null,
        }));

      return { topic, articles, error: null };
    } catch (err) {
      // Network error / timeout — apply short cooldown and retry.
      lastErr = err;
      throttle.reportThrottled(15_000);
    }
  }

  return { topic, articles: [], error: lastErr ? lastErr.message : 'unknown' };
}

/**
 * Fetch a list of topics sequentially with stagger.
 * Sequential (not parallel) is intentional: GDELT public API rate-limits
 * by IP and parallel hits are the fastest way to get permanently 429'd.
 */
async function fetchTopicList(topics) {
  const results = [];
  for (let i = 0; i < topics.length; i++) {
    // No internal stagger — pacing is enforced by gdelt_throttle
    // inside fetchTopic() so it coordinates with other GDELT callers.
    const r = await fetchTopic(topics[i]);
    results.push(r);
  }
  return results;
}

/**
 * Fetch one named topic group (a / b / c).
 */
async function fetchGroup(group) {
  const topics = getTopicsForGroup(group);
  return fetchTopicList(topics);
}

/**
 * Fetch all INTEL_TOPICS — only for manual smoke runs, not used by cron.
 * Cron uses fetchGroup() per scheduled group.
 */
async function fetchAllTopics() {
  return fetchTopicList(INTEL_TOPICS);
}

module.exports = {
  INTEL_TOPICS,
  TOPIC_GROUPS,
  getIntelTopics,
  getTopicsForGroup,
  fetchTopic,
  fetchTopicList,
  fetchGroup,
  fetchAllTopics,
  parseSeendate,
};
