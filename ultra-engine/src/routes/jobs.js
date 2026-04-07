// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Jobs / Empleo (P2)                  ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const scraper = require('../scraper');
const db = require('../db');
const jobApis = require('../job_apis');
const govJobs = require('../gov_jobs');

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
    const db = require('../db');
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

// ═══════════════════════════════════════════════════════════
//  P2 Phase 1 Quick Win — ATS APIs (Greenhouse/Lever/Ashby/SR)
// ═══════════════════════════════════════════════════════════

// ─── POST /api/jobs/fetch ─ Trigger fetch all tracked companies ─
router.post('/fetch', async (req, res) => {
  try {
    res.json({ ok: true, data: await jobApis.fetchAll() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/jobs/companies ─ Lista tracked companies ──
router.get('/companies', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, name, ats_type, ats_token, country, sector, visa_sponsor,
        is_active, last_fetched, last_count, notes
       FROM emp_tracked_companies ORDER BY last_count DESC NULLS LAST, name ASC`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/jobs/companies ─ Añadir empresa a trackear ─
router.post('/companies', async (req, res) => {
  try {
    const { name, ats_type, ats_token, country, sector, visa_sponsor, notes } = req.body;
    if (!name || !ats_type || !ats_token) {
      return res.status(400).json({ ok: false, error: 'name, ats_type, ats_token requeridos' });
    }
    if (!['greenhouse', 'lever', 'ashby', 'smartrecruiters'].includes(ats_type)) {
      return res.status(400).json({ ok: false, error: 'ats_type debe ser greenhouse|lever|ashby|smartrecruiters' });
    }
    const row = await db.queryOne(
      `INSERT INTO emp_tracked_companies (name, ats_type, ats_token, country, sector, visa_sponsor, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (ats_type, ats_token) DO UPDATE SET name=EXCLUDED.name, updated_at=NOW()
       RETURNING *`,
      [name, ats_type, ats_token, country || null, sector || null, visa_sponsor || false, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/jobs/high-score ─ Top match jobs ───────────
router.get('/high-score', async (req, res) => {
  try {
    const minScore = parseInt(req.query.min_score) || 50;
    const limit = parseInt(req.query.limit) || 20;
    const rows = await db.queryAll(
      `SELECT id, title, company, location_country, location_raw, sector,
        salary_min, salary_max, salary_currency, visa_sponsorship,
        match_score, speed_score, difficulty_score, total_score,
        url, posted_at
       FROM job_listings
       WHERE total_score >= $1 AND status = 'new'
         AND (is_remote = FALSE OR is_remote IS NULL)
       ORDER BY total_score DESC, posted_at DESC NULLS LAST
       LIMIT $2`,
      [minScore, limit]
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P2 FASE 2 — Gov sources + visa sponsors register
// ═══════════════════════════════════════════════════════════

router.post('/gov/fetch', async (req, res) => {
  try {
    const results = await govJobs.fetchAll();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/gov/fetch/:source', async (req, res) => {
  try {
    const fnMap = {
      usajobs: govJobs.fetchUSAJobs,
      jobtech_se: govJobs.fetchJobTechSE,
      hh_ru: govJobs.fetchHHru,
      nav_no: govJobs.fetchNAV,
    };
    const fn = fnMap[req.params.source];
    if (!fn) return res.status(404).json({ ok: false, error: 'Unknown source' });
    const result = await fn();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/visa-sponsors/import-uk', async (req, res) => {
  try {
    const result = await govJobs.importUKSponsorRegister({ url: req.body?.url });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/visa-sponsors/cross-ref', async (req, res) => {
  try {
    const result = await govJobs.crossRefVisaSponsors();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/visa-sponsors', async (req, res) => {
  try {
    const { country, q, limit } = req.query;
    const where = [];
    const params = [];
    if (country) { params.push(country.toUpperCase()); where.push(`country=$${params.length}`); }
    if (q) { params.push('%' + q.toLowerCase() + '%'); where.push(`LOWER(company_name) LIKE $${params.length}`); }
    params.push(parseInt(limit || '50', 10));
    const rows = await db.queryAll(
      `SELECT id, country, company_name, city, region, route, rating, source
       FROM emp_visa_sponsors
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY company_name LIMIT $${params.length}`,
      params
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
