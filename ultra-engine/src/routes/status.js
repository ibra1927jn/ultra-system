// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Estado del Sistema                   ║
// ║  Dashboard status + scheduler info                       ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const scheduler = require('../scheduler');

const router = express.Router();
const startTime = Date.now();

// ─── GET /api/status ─ Estado general ────────────────────
router.get('/', async (req, res) => {
  try {
    const health = await db.healthCheck();

    const docs = await db.queryOne(
      `SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE is_active = TRUE) as active,
       COUNT(*) FILTER (WHERE is_active = TRUE AND (expiry_date - CURRENT_DATE) <= alert_days AND (expiry_date - CURRENT_DATE) >= 0) as urgent,
       COUNT(*) FILTER (WHERE is_active = TRUE AND (expiry_date - CURRENT_DATE) < 0) as expired
       FROM document_alerts`
    );

    const feeds = await db.queryOne('SELECT COUNT(*) as total FROM rss_feeds WHERE is_active = TRUE').catch(e => { console.warn('status: rss_feeds query failed:', e.message); return { total: 0 }; });
    const articles = await db.queryOne('SELECT COUNT(*) as total FROM rss_articles').catch(e => { console.warn('status: rss_articles query failed:', e.message); return { total: 0 }; });
    const jobSources = await db.queryOne('SELECT COUNT(*) as total FROM job_sources WHERE is_active = TRUE').catch(e => { console.warn('status: job_sources query failed:', e.message); return { total: 0 }; });
    const jobListings = await db.queryOne('SELECT COUNT(*) as total FROM job_listings').catch(e => { console.warn('status: job_listings query failed:', e.message); return { total: 0 }; });

    const lastJobs = await db.queryAll(
      'SELECT * FROM scheduler_log ORDER BY executed_at DESC LIMIT 5'
    ).catch(e => { console.warn('status: scheduler_log query failed:', e.message); return []; });

    res.json({
      ok: true,
      data: {
        system: {
          uptime: Math.round((Date.now() - startTime) / 1000),
          db: health,
          timezone: process.env.TZ || 'UTC',
          version: '1.0.0',
        },
        documents: {
          total: parseInt(docs?.total || 0),
          active: parseInt(docs?.active || 0),
          urgent: parseInt(docs?.urgent || 0),
          expired: parseInt(docs?.expired || 0),
        },
        news: {
          feeds: parseInt(feeds?.total || 0),
          articles: parseInt(articles?.total || 0),
        },
        jobs: {
          sources: parseInt(jobSources?.total || 0),
          listings: parseInt(jobListings?.total || 0),
        },
        scheduler: {
          jobs: scheduler.listJobs(),
          recentLogs: lastJobs,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/status/user ─ Estado del usuario ───────────
router.get('/user', async (req, res) => {
  try {
    const status = await db.queryAll(
      'SELECT * FROM user_status ORDER BY category, key'
    );
    res.json({ ok: true, data: status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/status/user/:key ─ Actualizar estado ───────
router.put('/user/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, category } = req.body;

    const result = await db.queryOne(
      `INSERT INTO user_status (key, value, category, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, category = $3, updated_at = NOW()
       RETURNING *`,
      [key, value, category || 'general']
    );
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
