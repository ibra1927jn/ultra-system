// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: RSS Feeds (P1: Noticias)            ║
// ║  CRUD feeds + keywords para scoring inteligente          ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const rss = require('../rss');

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
