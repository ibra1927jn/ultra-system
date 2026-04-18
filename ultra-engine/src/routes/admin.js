// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Admin Routes                             ║
// ║  [P0-1.3] dump completo que antes vivía en /api/status.  ║
// ║  Requiere auth + (futuro) rol admin.                     ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const scheduler = require('../scheduler');

const router = express.Router();
const startTime = Date.now();

// Gate de rol: cuando exista req.user.role se exige 'admin'. En el
// despliegue actual (single-user) cualquier usuario autenticado pasa.
function requireAdmin(req, res, next) {
  if (req.user && req.user.role && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  next();
}

router.use(requireAdmin);

// GET /api/admin/status — dump interno completo.
router.get('/status', async (_req, res) => {
  try {
    const health = await db.healthCheck();

    const docs = await db.queryOne(
      `SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE is_active = TRUE) as active,
       COUNT(*) FILTER (WHERE is_active = TRUE AND (expiry_date - CURRENT_DATE) <= alert_days AND (expiry_date - CURRENT_DATE) >= 0) as urgent,
       COUNT(*) FILTER (WHERE is_active = TRUE AND (expiry_date - CURRENT_DATE) < 0) as expired
       FROM document_alerts`
    );

    const feeds = await db.queryOne('SELECT COUNT(*) as total FROM rss_feeds WHERE is_active = TRUE').catch(() => ({ total: 0 }));
    const articles = await db.queryOne('SELECT COUNT(*) as total FROM rss_articles').catch(() => ({ total: 0 }));
    const jobSources = await db.queryOne('SELECT COUNT(*) as total FROM job_sources WHERE is_active = TRUE').catch(() => ({ total: 0 }));
    const jobListings = await db.queryOne('SELECT COUNT(*) as total FROM job_listings').catch(() => ({ total: 0 }));

    const lastJobs = await db.queryAll(
      'SELECT * FROM scheduler_log ORDER BY executed_at DESC LIMIT 5'
    ).catch(() => []);

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

module.exports = router;
