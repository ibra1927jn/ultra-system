// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: RSS Feeds (P1: Noticias)            ║
// ║  CRUD feeds + keywords para scoring inteligente          ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const rss = require('../rss');
const dedup = require('../dedup_runner');
const earlyWarning = require('../early_warning');
const nlp = require('../nlp');
const db = require('../db');

const router = express.Router();

// ─── GET /api/feeds ─ Listar feeds ───────────────────────
router.get('/', async (req, res) => {
  try {
    const feeds = await rss.getFeeds();
    res.json({ ok: true, data: feeds });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/feeds ─ Anadir feed ──────────────────────
router.post('/', async (req, res) => {
  try {
    const { url, name, category } = req.body;
    if (!url || !name) {
      return res.status(400).json({ ok: false, error: 'Faltan url y name' });
    }
    const feed = await rss.addFeed(url, name, category);
    res.status(201).json({ ok: true, data: feed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/feeds/articles ─ Articulos recientes ───────
router.get('/articles', async (req, res) => {
  try {
    const { feed_id, limit } = req.query;
    const articles = await rss.getArticles(feed_id, parseInt(limit) || 20);
    res.json({ ok: true, data: articles });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/feeds/:id/fetch ─ Forzar fetch ───────────
// ─── POST /api/feeds/nlp/process ─ Run NLP on articles ──
// Aplica AFINN sentiment + TextRank summary a articles sin procesar.
router.post('/nlp/process', async (req, res) => {
  try {
    const limit = parseInt(req.body?.limit || '200', 10);
    const rows = await db.queryAll(
      `SELECT id, title, summary FROM rss_articles
       WHERE sentiment_score IS NULL
       ORDER BY id DESC LIMIT $1`,
      [limit]
    );
    let processed = 0;
    for (const r of rows) {
      const text = `${r.title || ''} ${r.summary || ''}`;
      const sent = nlp.sentiment(text);
      const auto = nlp.summarize(r.summary || r.title || '', { numSentences: 2 });
      await db.query(
        `UPDATE rss_articles
         SET sentiment_score = $1, sentiment_label = $2, auto_summary = $3
         WHERE id = $4`,
        [sent.comparative, sent.label, auto || null, r.id]
      );
      processed++;
    }
    res.json({ ok: true, processed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/feeds/sentiment-stats ──────────────────────
router.get('/sentiment-stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const rows = await db.queryAll(
      `SELECT sentiment_label, COUNT(*) as count, ROUND(AVG(sentiment_score)::numeric, 4) as avg_score
       FROM rss_articles
       WHERE sentiment_score IS NOT NULL
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY sentiment_label`
    );
    res.json({ ok: true, days, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/feeds/dedup ─ Cross-table MinHash dedup ───
// (debe ir antes de :id/fetch para evitar matching parámetro greedy)
router.post('/dedup', async (req, res) => {
  try {
    const lookbackDays = parseInt(req.body?.lookback_days || '30', 10);
    const threshold = parseFloat(req.body?.threshold || '0.7');
    const result = await dedup.runAll({ lookbackDays, threshold });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/feeds/early-warning/fetch ─ Trigger all ───
router.post('/early-warning/fetch', async (req, res) => {
  try {
    const results = await earlyWarning.fetchAll();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/feeds/events ─ List events_store ───────────
router.get('/events', async (req, res) => {
  try {
    const { source, country, severity, limit } = req.query;
    const where = [];
    const params = [];
    if (source) { params.push(source); where.push(`source=$${params.length}`); }
    if (country) { params.push(country.toUpperCase()); where.push(`country=$${params.length}`); }
    if (severity) { params.push(severity); where.push(`severity=$${params.length}`); }

    params.push(parseInt(limit || '50', 10));
    const rows = await db.queryAll(
      `SELECT id, source, event_type, severity, title, country, magnitude, occurred_at, url
       FROM events_store
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY occurred_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/:id/fetch', async (req, res) => {
  try {
    const { newCount, highScoreArticles } = await rss.fetchFeed(req.params.id);
    res.json({ ok: true, newArticles: newCount, highScore: highScoreArticles });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  KEYWORDS — Configuracion de scoring RSS
// ═══════════════════════════════════════════════════════════

// ─── GET /api/feeds/keywords ─ Listar keywords ──────────
router.get('/keywords', async (req, res) => {
  try {
    const keywords = await rss.getKeywords();
    res.json({ ok: true, data: keywords, threshold: rss.SCORE_THRESHOLD });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/feeds/keywords ─ Agregar keyword ────────
router.post('/keywords', async (req, res) => {
  try {
    const { keyword, weight } = req.body;
    if (!keyword) {
      return res.status(400).json({ ok: false, error: 'Falta campo obligatorio: keyword' });
    }
    const result = await rss.addKeyword(keyword, weight);
    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/feeds/keywords/:id ─ Eliminar keyword ──
router.delete('/keywords/:id', async (req, res) => {
  try {
    const result = await rss.deleteKeyword(req.params.id);
    if (!result) return res.status(404).json({ ok: false, error: 'Keyword no encontrado' });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
