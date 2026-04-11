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

const ENRICH_MAX_INFLIGHT = Number(process.env.NLP_ENRICH_MAX_INFLIGHT || 3);
const ENRICH_TOPICS = (process.env.NLP_ENRICH_TOPICS ||
  'geopolitics,economy,security,technology,health,climate,migration,human-rights,science,sports'
).split(',').map(s => s.trim()).filter(Boolean);

let _inflight = 0;

function _stats() {
  return { inflight: _inflight };
}

async function enrichArticle({ articleId, title, summary }) {
  if (!articleId || !title) return null;
  if (_inflight >= ENRICH_MAX_INFLIGHT) return null;
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
    return { articleId, hasEmbedding: !!embedding, sentimentLabel };
  } catch (err) {
    console.error('nlp_enrich error:', err.message);
    return null;
  } finally {
    _inflight -= 1;
  }
}

module.exports = { enrichArticle, _stats, ENRICH_TOPICS };
