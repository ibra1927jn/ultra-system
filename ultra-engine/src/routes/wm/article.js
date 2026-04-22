const express = require('express');
const db = require('../../db');
const { validateOutboundUrl } = require('./url-safety');
const { scrapeLimiter } = require('./rate-limit');
const router = express.Router();

router.get('/article/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const article = await db.queryOne(`
      SELECT a.id, a.title, a.url, a.summary, a.auto_summary, a.published_at,
             a.relevance_score, a.sentiment_label, a.sentiment_score, a.entities,
             a.event_cluster_id,
             f.name AS source_name, f.category AS source_category, f.lang,
             f.geo_scope_value AS country_iso,
             e.summary AS nlp_summary, e.classify_topics, e.enriched_at
      FROM rss_articles a
      LEFT JOIN rss_feeds f ON f.id = a.feed_id
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE a.id = $1
    `, [id]);

    if (!article) return res.status(404).json({ ok: false, error: 'article not found' });

    const text = (article.nlp_summary || article.auto_summary || article.summary || '') + ' ' + (article.title || '');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    article.reading_time_min = Math.max(1, Math.round(wordCount / 200));
    article.word_count = wordCount;

    let cluster = null;
    if (article.event_cluster_id) {
      const siblings = await db.queryAll(`
        SELECT a.id, a.title, a.url, a.published_at, f.name AS source_name
        FROM rss_articles a
        LEFT JOIN rss_feeds f ON f.id = a.feed_id
        WHERE a.event_cluster_id = $1 AND a.id != $2
        ORDER BY a.relevance_score DESC, a.published_at DESC
        LIMIT 5
      `, [article.event_cluster_id, id]);
      cluster = { id: article.event_cluster_id, sibling_count: siblings.length, siblings };
    }

    res.json({ ok: true, data: { article, cluster } });
  } catch (err) {
    console.error('❌ /api/wm/article error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/article/:id/fulltext ─ Scrape + summarize on demand ──
// Uses ultra_extract (trafilatura) to fetch article text, then optionally
// summarizes via ultra_nlp. Persists result to rss_articles_enrichment.summary.
router.get('/article/:id/fulltext', scrapeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const row = await db.queryOne(`
      SELECT a.id, a.url, a.title, e.summary AS existing_summary
      FROM rss_articles a
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE a.id = $1
    `, [id]);
    if (!row) return res.status(404).json({ ok: false, error: 'article not found' });
    if (!row.url) return res.status(400).json({ ok: false, error: 'no url' });

    // SSRF guard — block private IPs, metadata endpoints, internal docker services
    const urlCheck = validateOutboundUrl(row.url);
    if (!urlCheck.ok) {
      console.warn(`⚠️  SSRF blocked for article ${id}: ${urlCheck.reason} (${row.url})`);
      return res.status(400).json({ ok: false, error: `URL rejected: ${urlCheck.reason}` });
    }

    // 1. Extract full text via trafilatura sidecar
    let extracted = null;
    try {
      const extractRes = await fetch('http://ultra_extract:8000/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: row.url })
      });
      if (extractRes.ok) extracted = await extractRes.json();
    } catch (e) {
      console.warn('extract failed:', e.message);
    }

    const fullText = extracted?.text || '';
    if (!fullText || fullText.length < 100) {
      return res.json({ ok: true, data: { text: '', summary: row.existing_summary || '', error: 'could not extract article content' } });
    }

    // 2. Summarize via NLP sidecar (~3-5 sentences)
    let summary = '';
    try {
      const sumRes = await fetch('http://ultra_nlp:8000/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText.slice(0, 4000) })
      });
      if (sumRes.ok) {
        const sumJson = await sumRes.json();
        summary = (sumJson.summary || '').trim();
      }
    } catch (e) {
      console.warn('summarize failed:', e.message);
    }

    // 3. Persist summary if generated
    if (summary && summary.length > 30) {
      try {
        await db.queryOne(`
          INSERT INTO rss_articles_enrichment (article_id, summary, enriched_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (article_id) DO UPDATE
          SET summary = COALESCE(rss_articles_enrichment.summary, EXCLUDED.summary),
              enriched_at = EXCLUDED.enriched_at
        `, [id, summary]);
      } catch (e) { console.warn('persist summary:', e.message); }
    }

    // Split text into readable paragraphs
    const cleanText = fullText.replace(/\s+/g, ' ').trim();
    const paragraphs = cleanText.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/g)
      .reduce((acc, sent) => {
        if (!acc.length) return [sent];
        const last = acc[acc.length - 1];
        if (last.length + sent.length < 350) acc[acc.length - 1] = last + ' ' + sent;
        else acc.push(sent);
        return acc;
      }, [])
      .filter(p => p.length > 20)
      .slice(0, 30);

    res.json({
      ok: true,
      data: {
        text: cleanText.slice(0, 15000),
        paragraphs,
        summary,
        title: extracted.title || row.title,
        author: extracted.author,
        published: extracted.date,
        language: extracted.language,
        sitename: extracted.sitename,
        word_count: cleanText.split(/\s+/).length,
      }
    });
  } catch (err) {
    console.error('❌ /api/wm/article/fulltext error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/wm/translate ─ Translate arbitrary text via ultra_nlp ──
router.post('/translate', scrapeLimiter, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const text = String(req.body?.text || '').slice(0, 8000);
    const target = String(req.body?.target || 'en').slice(0, 5);
    if (!text || text.length < 2) return res.status(400).json({ ok: false, error: 'no text' });

    const trRes = await fetch('http://ultra_nlp:8000/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target })
    });
    if (!trRes.ok) return res.status(502).json({ ok: false, error: 'translation service error' });
    const trJson = await trRes.json();
    res.json({ ok: true, data: { translated: trJson.translation || trJson.translated_text || '', target } });
  } catch (err) {
    console.error('❌ /api/wm/translate error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/geo-hierarchy ─ Static geo tree ─────────

module.exports = router;
