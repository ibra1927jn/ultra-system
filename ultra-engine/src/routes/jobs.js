// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Jobs / Empleo (P2)                  ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const scraper = require('../scraper');

const router = express.Router();

// ─── GET /api/jobs ─ Listar ofertas ──────────────────────
router.get('/', async (req, res) => {
  try {
    const { source_id, limit } = req.query;
    const listings = await scraper.getListings(source_id, parseInt(limit) || 20);
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

module.exports = router;
