// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Bluesky Jetstream WebSocket subscriber    ║
// ║                                                            ║
// ║  P1 Lote A B7. Sustituye el polling REST hourly            ║
// ║  (news_apis.js fetchBlueskySearch + cron 'bsky-search')   ║
// ║  por una conexión persistente al firehose Jetstream:      ║
// ║                                                            ║
// ║    wss://jetstream2.us-east.bsky.network/subscribe        ║
// ║                                                            ║
// ║  Doc: https://github.com/bluesky-social/jetstream         ║
// ║                                                            ║
// ║  Filtramos a `app.bsky.feed.post` solo (no likes/follows) ║
// ║  y matcheamos el texto contra los top-30 keywords del     ║
// ║  scorer en memoria (refresh cada 5 min). Si hay match      ║
// ║  insertamos en rss_articles (feed_id del pseudo-feed      ║
// ║  'bsky', mismo que el polling antiguo → continuidad        ║
// ║  histórica).                                               ║
// ║                                                            ║
// ║  Reconnect con exponential backoff 1s→60s, copiado del    ║
// ║  patrón aisstream_subscriber.js.                          ║
// ╚══════════════════════════════════════════════════════════╝

const WebSocket = require('ws');
const db = require('./db');
const rss = require('./rss');

const JETSTREAM_URL = process.env.BSKY_JETSTREAM_URL
  || 'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';

const KEYWORD_REFRESH_MS = 5 * 60 * 1000;
const KEYWORD_TOP_N = 30;

// ─── Connection state ─────────────────────────────────────
let ws = null;
let connecting = false;
let stopped = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let connectStartedAt = null;
let lastMessageAt = null;

// ─── Stats counters ───────────────────────────────────────
let messagesReceived = 0;
let postsParsed = 0;
let keywordHits = 0;
let articlesInserted = 0;
let dbErrors = 0;

// ─── Keyword matcher (in-memory) ──────────────────────────
let keywords = [];           // Array of {keyword, weight} (lowercased)
let keywordsLoadedAt = 0;
let pseudoFeedId = null;

async function loadKeywords() {
  try {
    const rows = await db.queryAll(
      `SELECT keyword, weight FROM rss_keywords ORDER BY weight DESC LIMIT $1`,
      [KEYWORD_TOP_N]
    );
    keywords = rows.map(r => ({
      keyword: String(r.keyword).toLowerCase(),
      weight: r.weight,
    }));
    keywordsLoadedAt = Date.now();
  } catch (err) {
    console.error('❌ jetstream loadKeywords:', err.message);
  }
}

async function loadFeedId() {
  if (pseudoFeedId) return pseudoFeedId;
  const row = await db.queryOne(
    `SELECT id FROM rss_feeds WHERE category = 'bsky' LIMIT 1`
  );
  if (!row) throw new Error("pseudo-feed category='bsky' not found");
  pseudoFeedId = row.id;
  return pseudoFeedId;
}

// ─── Per-message handler ──────────────────────────────────
function extractPost(msg) {
  // Jetstream commit shape:
  // { kind:'commit', did, time_us, commit:{rev,operation,collection,rkey,record:{text,...},cid} }
  if (msg.kind !== 'commit') return null;
  const commit = msg.commit;
  if (!commit || commit.operation !== 'create') return null;
  if (commit.collection !== 'app.bsky.feed.post') return null;
  const record = commit.record;
  if (!record || typeof record.text !== 'string' || !record.text) return null;
  const did = msg.did;
  const rkey = commit.rkey;
  return {
    did,
    rkey,
    text: record.text,
    createdAt: record.createdAt,
    langs: record.langs || [],
  };
}

function matchKeywords(textLower) {
  const hits = [];
  for (const k of keywords) {
    if (textLower.includes(k.keyword)) hits.push(k);
  }
  return hits;
}

async function handlePost(post) {
  postsParsed++;
  const textLower = post.text.toLowerCase();
  const hits = matchKeywords(textLower);
  if (hits.length === 0) return;
  keywordHits++;

  // Construct canonical bsky.app URL. We don't have the handle in the
  // jetstream payload (only the DID), so use did directly — bsky.app
  // resolves did URLs.
  const url = `https://bsky.app/profile/${post.did}/post/${post.rkey}`;
  const topHit = hits[0].keyword;
  const title = `[bsky] ${post.text.slice(0, 200)}`;
  const summary = `Bsky jetstream · matched: ${hits.map(h => h.keyword).slice(0,3).join(',')} · ${post.did}`;
  const publishedAt = post.createdAt ? new Date(post.createdAt) : new Date();

  let score;
  try {
    const baseScore = await rss.scoreArticle(post.text, '');
    // 2026-04-12 — Penalty ×0.5: social media posts are high-noise/low-signal
    // compared to curated RSS. A bsky post needs double the keyword weight to
    // reach enrichment (≥3) or alert (≥8) thresholds.
    score = Math.max(1, Math.floor(baseScore * 0.5));
  } catch {
    score = 2;
  }

  try {
    const feedId = await loadFeedId();
    const existing = await db.queryOne(
      `SELECT id FROM rss_articles WHERE url = $1`, [url]
    );
    if (existing) return;
    await db.query(
      `INSERT INTO rss_articles (feed_id, title, url, summary, published_at, relevance_score)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [feedId, title, url, summary, publishedAt, score]
    );
    articlesInserted++;
  } catch (err) {
    dbErrors++;
    if (dbErrors < 10) console.error('❌ jetstream insert:', err.message);
  }
}

// ─── Backoff (mirror del aisstream pattern) ───────────────
function backoffDelay() {
  const base = Math.min(60_000, 1000 * Math.pow(2, Math.min(reconnectAttempts, 6)));
  return base + Math.floor(Math.random() * base * 0.25);
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectAttempts++;
  const delay = backoffDelay();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

// ─── Connection lifecycle ─────────────────────────────────
function connect() {
  if (stopped || connecting || ws) return;

  connecting = true;
  connectStartedAt = Date.now();

  try {
    ws = new WebSocket(JETSTREAM_URL);
  } catch (err) {
    console.error('❌ Jetstream WebSocket constructor failed:', err.message);
    connecting = false;
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    connecting = false;
    reconnectAttempts = 0;
    console.log(`🦋 Bsky Jetstream connected: ${JETSTREAM_URL.replace(/^wss:\/\//, '')}`);
  });

  ws.on('message', (raw) => {
    messagesReceived++;
    lastMessageAt = Date.now();
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const post = extractPost(msg);
    if (!post) return;
    // Fire-and-forget — handlePost manages its own errors and DB inserts
    // are quick (single SELECT + optional INSERT). The Bluesky firehose
    // arrives at ~50-150 msg/s; Postgres handles this comfortably.
    handlePost(post).catch(() => {});
  });

  ws.on('close', (code, reason) => {
    if (ws) {
      try { ws.removeAllListeners(); } catch {}
    }
    ws = null;
    connecting = false;
    if (stopped) return;
    console.warn(`⚠️  Jetstream disconnected (code ${code}, reason: ${String(reason).slice(0,80)}). Reconnecting…`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('❌ Jetstream WebSocket error:', err.message);
    // 'close' will fire next and trigger reconnect
  });
}

// ─── Public API ───────────────────────────────────────────
async function start() {
  if (stopped) {
    console.log('🦋 Jetstream subscriber: re-starting after stop');
    stopped = false;
  }
  await loadKeywords();
  if (keywords.length === 0) {
    console.warn('⚠️  Jetstream: no keywords loaded — subscriber will receive but never match');
  }
  // Periodic refresh of keyword list so newly added keywords activate
  // without restart.
  setInterval(() => { loadKeywords().catch(() => {}); }, KEYWORD_REFRESH_MS);
  connect();
}

function stop() {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
}

function getStatus() {
  return {
    connected: ws !== null && ws.readyState === WebSocket.OPEN,
    messagesReceived,
    postsParsed,
    keywordHits,
    articlesInserted,
    dbErrors,
    keywordsLoaded: keywords.length,
    keywordsLoadedAt: keywordsLoadedAt ? new Date(keywordsLoadedAt).toISOString() : null,
    reconnectAttempts,
    lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
    url: JETSTREAM_URL,
  };
}

module.exports = { start, stop, getStatus, _extractPost: extractPost, _matchKeywords: matchKeywords };
