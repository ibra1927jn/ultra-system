// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Jobs / Empleo (P2)                  ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const scraper = require('../scraper');

const router = express.Router();

// ─── GET /api/jobs ─ Listar ofertas ──────────────────────
router.get('/', async (req, res) => {
  try {
    const { source_id, limit, category } = req.query;
    const listings = await scraper.getListings(source_id, parseInt(limit) || 20, category);
    res.json({ ok: true, data: listings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/jobs/sources ─ Listar fuentes ──────────────
router.get('/sources', async (req, res) => {
  try {
    const sources = await scraper.getSources();
    res.json({ ok: true, data: sources });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/jobs/sources ─ Añadir fuente ──────────────
router.post('/sources', async (req, res) => {
  try {
    const { url, name, css_selector, region } = req.body;
    if (!url || !name || !css_selector) {
      return res.status(400).json({ ok: false, error: 'Faltan url, name y css_selector' });
    }
    const source = await scraper.addSource(url, name, css_selector, region);
    res.status(201).json({ ok: true, data: source });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/jobs/sources/:id/check ─ Forzar scrape ───
router.post('/sources/:id/check', async (req, res) => {
  try {
    const count = await scraper.checkSource(req.params.id);
    res.json({ ok: true, newListings: count });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/jobs/scrape ─ Forzar scrape de todas las fuentes ──
router.post('/scrape', async (req, res) => {
  try {
    const count = await scraper.checkAll();
    res.json({ ok: true, new_listings: count });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/jobs/search ─ Busqueda custom en Adzuna ──
router.post('/search', async (req, res) => {
  try {
    const { query, location } = req.body;
    if (!query) return res.status(400).json({ ok: false, error: 'Missing query' });
    const result = await scraper.searchAdzuna(query, location || 'New Zealand');
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/jobs/:id/status ─ Actualizar estado de oferta ──
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new', 'saved', 'applied', 'rejected'];
    if (!valid.includes(status)) {
      return res.status(400).json({ ok: false, error: `Status must be: ${valid.join(', ')}` });
    }
    const result = await db.queryOne(
      'UPDATE job_listings SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!result) return res.status(404).json({ ok: false, error: 'Job not found' });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
