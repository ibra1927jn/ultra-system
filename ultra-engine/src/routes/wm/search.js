const express = require('express');
const db = require('../../db');
const { searchLimiter } = require('./rate-limit');
const { cacheMiddleware, searchCache, suggestCache } = require('./cache');
const router = express.Router();

router.get('/search', searchLimiter, cacheMiddleware(searchCache), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 200);
    if (q.length < 2) return res.json({ ok: true, count: 0, data: [] });
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const hours = Math.min(parseInt(req.query.hours, 10) || 168, 720);

    // Build tsquery: split on whitespace, join with & for AND
    const tokens = q.split(/\s+/).filter(t => t.length >= 2).map(t => t.replace(/[^\p{L}\p{N}]+/gu, ''));
    if (!tokens.length) return res.json({ ok: true, count: 0, data: [] });
    const tsQuery = tokens.map(t => t + ':*').join(' & ');  // prefix match with AND

    const rows = await db.queryAll(`
      SELECT a.id AS article_id, a.title, a.url, a.published_at, a.relevance_score,
             f.name AS source_name, f.lang, f.geo_scope_value AS country_iso,
             COALESCE(e.summary, a.auto_summary, a.summary) AS nlp_summary,
             COALESCE(e.sentiment_label, a.sentiment_label, 'neutral') AS sentiment_label,
             ts_rank(to_tsvector('simple', coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.auto_summary,'')),
                     to_tsquery('simple', $1)) AS rank
      FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE to_tsvector('simple', coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.auto_summary,''))
            @@ to_tsquery('simple', $1)
        AND a.published_at >= NOW() - ($3::int * INTERVAL '1 hour')
      ORDER BY rank DESC, a.relevance_score DESC, a.published_at DESC
      LIMIT $2
    `, [tsQuery, limit, hours]);

    res.json({ ok: true, query: q, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/search error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/search/suggest ─ Autocomplete suggestions ──
// Returns top article titles + trending terms matching the prefix.
// Fast: uses trigram index for similarity matching.
router.get('/search/suggest', cacheMiddleware(suggestCache), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 50);
    if (q.length < 2) return res.json({ ok: true, data: [] });

    const [trending, titles] = await Promise.all([
      db.queryAll(`
        SELECT term, mention_count FROM wm_trending_keywords
        WHERE term ILIKE $1 ORDER BY mention_count DESC LIMIT 5
      `, [q + '%']),
      db.queryAll(`
        SELECT title FROM rss_articles
        WHERE title ILIKE $1 AND published_at >= NOW() - INTERVAL '48 hours'
        ORDER BY relevance_score DESC, published_at DESC LIMIT 8
      `, ['%' + q + '%'])
    ]);

    const suggestions = [
      ...trending.map(t => ({ type: 'trending', value: t.term, count: parseInt(t.mention_count) })),
      ...titles.map(t => ({ type: 'title', value: t.title.slice(0, 100) })),
    ];
    res.json({ ok: true, data: suggestions });
  } catch (err) {
    console.error('❌ /api/wm/search/suggest error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/compare ─ Side-by-side country metrics ──
// Given ?isos=US,FR,RU returns comparable snapshot per country:
// article volume, sentiment, risk, focal points, top story, GDELT alert.
// Used by the comparison UI to show 2-4 countries side by side.

module.exports = router;
