// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — NLP enrichment orchestrator (B8)         ║
// ║                                                            ║
// ║  Best-effort: takes a freshly-inserted article (id, title, ║
// ║  summary), calls the ultra_nlp sidecar for embeddings +    ║
// ║  sentiment + zero-shot classify + summary, and persists    ║
// ║  to rss_articles_enrichment.                                ║
// ║                                                            ║
// ║  Never throws. Never blocks the caller. Caller pattern:    ║
// ║    enrichArticle({...}).catch(()=>{}); // fire-and-forget  ║
// ║                                                            ║
// ║  Concurrency cap: at most ENRICH_MAX_INFLIGHT in flight at ║
// ║  once so a slow sidecar doesn't accumulate unbounded       ║
// ║  promises during a long fetchAll cycle.                    ║
// ╚══════════════════════════════════════════════════════════╝

'use strict';

const db = require('./db');
const nlp = require('./nlp_sidecar');

// 2026-04-12: cap raised 3→8 + wait-with-bounded-queue. Previous logic
// dropped any call above the inflight cap silently, which on a long
// fetchAll cycle (700+ feeds, ~2400 high-score articles bursting) gave
// an enrichment ratio of 0.17% (4/2400) — almost everything was lost.
// New behavior:
//   - up to ENRICH_MAX_INFLIGHT concurrent in-flight calls (default 8)
//   - up to ENRICH_MAX_QUEUE additional callers waiting (default 100)
//   - above queue cap → drop (preserves catastrophic load protection)
//
// NLP sidecar has lazy LRU max 2 models in RAM; 8 concurrent calls
// will serialize there naturally but engine no longer drops silently.
const ENRICH_MAX_INFLIGHT = Number(process.env.NLP_ENRICH_MAX_INFLIGHT || 8);
const ENRICH_MAX_QUEUE = Number(process.env.NLP_ENRICH_MAX_QUEUE || 100);
const ENRICH_TOPICS = (process.env.NLP_ENRICH_TOPICS ||
  'geopolitics,economy,security,technology,health,climate,migration,human-rights,science,sports'
).split(',').map(s => s.trim()).filter(Boolean);

let _inflight = 0;
let _waiting = 0;
let _dropped = 0;
let _processed = 0;

function _stats() {
  return { inflight: _inflight, waiting: _waiting, dropped: _dropped, processed: _processed };
}

async function _waitForSlot() {
  while (_inflight >= ENRICH_MAX_INFLIGHT) {
    await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
  }
}

async function enrichArticle({ articleId, title, summary }) {
  if (!articleId || !title) return null;
  if (_waiting >= ENRICH_MAX_QUEUE) {
    _dropped += 1;
    return null;
  }
  _waiting += 1;
  try {
    await _waitForSlot();
  } finally {
    _waiting -= 1;
  }
  _inflight += 1;
  try {
    const fullText = `${title}. ${summary || ''}`.trim();

    // Run all 4 calls in parallel. Each returns null on failure;
    // we proceed with whatever succeeded.
    const [embRes, sentRes, classRes, sumRes] = await Promise.all([
      nlp.embed([fullText.slice(0, 2000)]),
      nlp.sentiment(fullText.slice(0, 1500)),
      nlp.classify(fullText.slice(0, 2000), ENRICH_TOPICS, { multiLabel: true }),
      // Only summarize if there's enough text to be worth it
      fullText.length >= 200 ? nlp.summarize(fullText.slice(0, 4000)) : Promise.resolve(null),
    ]);

    const embedding = embRes?.vectors?.[0] ?? null;
    const sentimentLabel = sentRes?.label ?? null;
    const sentimentScore = sentRes?.score ?? null;
    const classifyTopics = classRes
      ? classRes.labels.map((l, i) => ({ label: l, score: classRes.scores[i] }))
      : null;
    const summaryText = sumRes?.summary ?? null;

    // If everything failed, don't write a no-op row
    if (!embedding && !sentimentLabel && !classifyTopics && !summaryText) {
      return null;
    }

    await db.query(
      `INSERT INTO rss_articles_enrichment
         (article_id, embedding, sentiment_label, sentiment_score, classify_topics, summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (article_id) DO UPDATE SET
         embedding       = COALESCE(EXCLUDED.embedding, rss_articles_enrichment.embedding),
         sentiment_label = COALESCE(EXCLUDED.sentiment_label, rss_articles_enrichment.sentiment_label),
         sentiment_score = COALESCE(EXCLUDED.sentiment_score, rss_articles_enrichment.sentiment_score),
         classify_topics = COALESCE(EXCLUDED.classify_topics, rss_articles_enrichment.classify_topics),
         summary         = COALESCE(EXCLUDED.summary, rss_articles_enrichment.summary),
         enriched_at     = NOW()`,
      [
        articleId,
        embedding ? JSON.stringify(embedding) : null,
        sentimentLabel,
        sentimentScore,
        classifyTopics ? JSON.stringify(classifyTopics) : null,
        summaryText,
      ]
    );
    _processed += 1;
    return { articleId, hasEmbedding: !!embedding, sentimentLabel };
  } catch (err) {
    console.error('nlp_enrich error:', err.message);
    return null;
  } finally {
    _inflight -= 1;
  }
}

/**
 * Backfill enrichment for high-score articles missing it.
 * Designed for nightly cron OR manual catch-up.
 *
 * @param {object} opts
 * @param {number} opts.minScore default SCORE_THRESHOLD (8)
 * @param {number} opts.limit max articles to process per call (default 200)
 * @param {number} opts.sinceHours look-back window (default 168 = 7d)
 */
async function enrichBackfill({ minScore = 8, limit = 200, sinceHours = 168 } = {}) {
  const rows = await db.queryAll(
    `SELECT a.id, a.title, a.summary
     FROM rss_articles a
     LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
     WHERE a.relevance_score >= $1
       AND a.created_at > NOW() - ($2 || ' hours')::INTERVAL
       AND e.article_id IS NULL
     ORDER BY a.relevance_score DESC, a.created_at DESC
     LIMIT $3`,
    [minScore, String(sinceHours), limit]
  );
  let ok = 0, fail = 0;
  for (const r of rows) {
    const result = await enrichArticle({ articleId: r.id, title: r.title, summary: r.summary });
    if (result) ok++; else fail++;
  }
  return { candidates: rows.length, enriched: ok, failed: fail, stats: _stats() };
}

module.exports = { enrichArticle, enrichBackfill, _stats, ENRICH_TOPICS };
