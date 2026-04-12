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
const spacy = require('./spacy');

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
const ENRICH_MAX_INFLIGHT = Number(process.env.NLP_ENRICH_MAX_INFLIGHT || 12);
const ENRICH_MAX_QUEUE = Number(process.env.NLP_ENRICH_MAX_QUEUE || 2000);
const BACKFILL_CONCURRENCY = Number(process.env.NLP_BACKFILL_CONCURRENCY || 6);
// 25 broad labels for zero-shot classify. Covers 69 taxonomy topics.
// Feed primary_topic provides granular sub-topic; NLP provides article-level.
const ENRICH_TOPICS = (process.env.NLP_ENRICH_TOPICS ||
  'conflict and war,geopolitics and diplomacy,economy and finance,trade and sanctions,' +
  'energy,climate and environment,health and disease,cybersecurity,maritime and shipping,' +
  'migration and refugees,terrorism,nuclear proliferation,food security,natural disaster,' +
  'technology and AI,human rights,elections and governance,military and defense,' +
  'science and research,space and astronomy,sports,entertainment and culture,' +
  'education,law and justice,religion,society and demographics'
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

async function enrichArticle({ articleId, title, summary, lang = 'en', skipEmbedding = false, skipClassify = false }) {
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

    // Translate non-English text before summarize (which is English-only).
    // Sentiment model (xlm-roberta) is multilingual — works on original text.
    let enText = fullText;
    if (lang && lang !== 'en') {
      const tr = await nlp.translate(fullText.slice(0, 1500));
      if (tr?.translation) enText = tr.translation;
    }

    const calls = [
      skipEmbedding ? Promise.resolve(null) : nlp.embed([fullText.slice(0, 2000)]),
      nlp.sentiment(fullText.slice(0, 1500)),
      skipClassify ? Promise.resolve(null) : nlp.classify(enText.slice(0, 2000), ENRICH_TOPICS, { multiLabel: true }),
      enText.length >= 200 ? nlp.summarize(enText.slice(0, 4000)) : Promise.resolve(null),
    ];
    const [embRes, sentRes, classRes, sumRes] = await Promise.all(calls);

    const embedding = embRes?.vectors?.[0] ?? null;
    const sentimentLabel = sentRes?.label ?? null;
    const sentimentScore = sentRes?.score ?? null;
    // Only keep top labels with score > 0.3 (max 5) — the rest is noise.
    // Reduces JSONB from ~2KB (26 labels) to ~200B (3-5 labels).
    const classifyTopics = classRes
      ? classRes.labels
          .map((l, i) => ({ label: l, score: classRes.scores[i] }))
          .filter(t => t.score > 0.3)
          .slice(0, 5)
      : null;
    const summaryText = sumRes?.summary ?? null;

    // spaCy NER — extract real named entities (people, places, orgs)
    // Uses en or es model. Deduplicates by text+label.
    const spacyLang = (lang === 'es') ? 'es' : 'en';
    const nerText = (spacyLang === 'en') ? enText : fullText;
    const nerRes = await spacy.ner(nerText.slice(0, 5000), spacyLang);
    let namedEntities = null;
    if (nerRes?.entities?.length > 0) {
      // Dedupe and keep only PERSON, ORG, GPE, LOC, NORP, EVENT, FAC
      const keep = new Set(['PERSON','ORG','GPE','LOC','NORP','EVENT','FAC','PER']);
      const seen = new Set();
      namedEntities = nerRes.entities
        .filter(e => keep.has(e.label))
        .filter(e => { const k = `${e.text}|${e.label}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .map(e => ({ text: e.text, label: e.label }));
      if (namedEntities.length === 0) namedEntities = null;
    }

    // If everything failed, don't write a no-op row
    if (!embedding && !sentimentLabel && !classifyTopics && !summaryText && !namedEntities) {
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

    // Mirror to rss_articles for unified queries
    const updates = [];
    const vals = [];
    let idx = 1;
    if (sentimentLabel) { updates.push(`sentiment_label = $${idx++}`); vals.push(sentimentLabel); }
    if (sentimentScore != null) { updates.push(`sentiment_score = $${idx++}`); vals.push(sentimentScore); }
    if (summaryText) { updates.push(`auto_summary = $${idx++}`); vals.push(summaryText); }
    // entities = spaCy NER (people, places, orgs). Falls back to classify_topics if NER empty.
    const entitiesJson = namedEntities || classifyTopics;
    if (entitiesJson) { updates.push(`entities = $${idx++}`); vals.push(JSON.stringify(entitiesJson)); }
    if (updates.length > 0) {
      vals.push(articleId);
      await db.query(
        `UPDATE rss_articles SET ${updates.join(', ')} WHERE id = $${idx}`,
        vals
      );
    }

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
 * Backfill enrichment for articles missing it.
 *
 * @param {object} opts
 * @param {number} opts.minScore default 3
 * @param {number} opts.limit max articles per call (default 500)
 * @param {number} opts.sinceHours 0 = no time limit (default)
 * @param {number} opts.concurrency parallel enrichments (default BACKFILL_CONCURRENCY)
 */
async function enrichBackfill({ minScore = 3, limit = 500, sinceHours = 0, concurrency = BACKFILL_CONCURRENCY } = {}) {
  const params = [minScore, limit];
  let timeClause = '';
  if (sinceHours > 0) {
    timeClause = `AND a.created_at > NOW() - ($3 || ' hours')::INTERVAL`;
    params.push(String(sinceHours));
  }
  const rows = await db.queryAll(
    `SELECT a.id, a.title, a.summary, f.lang
     FROM rss_articles a
     LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
     JOIN rss_feeds f ON f.id = a.feed_id
     WHERE a.relevance_score >= $1
       AND e.article_id IS NULL
       AND f.category != 'bsky'
       ${timeClause}
     ORDER BY a.relevance_score DESC, a.created_at DESC
     LIMIT $2`,
    params
  );
  let ok = 0, fail = 0;

  // Process in chunks of `concurrency` for parallel throughput
  // Skip embeddings + classify in backfill — heavy to compute on CPU.
  // Classify (26-label zero-shot) = 26 forward passes per article.
  // Feed primary_topic already provides topic info.
  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map(r => enrichArticle({ articleId: r.id, title: r.title, summary: r.summary, lang: r.lang || 'en', skipEmbedding: true, skipClassify: true }))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) ok++; else fail++;
    }
  }
  return { candidates: rows.length, enriched: ok, failed: fail, stats: _stats() };
}

module.exports = { enrichArticle, enrichBackfill, _stats, ENRICH_TOPICS };
