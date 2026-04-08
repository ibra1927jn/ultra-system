// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: WorldMonitor Phase 2 read-only      ║
// ║  Consumer de las 4 tablas wm_* producidas por los crons  ║
// ║  wm-cluster-news, wm-focal-points, wm-country-scores,    ║
// ║  wm-trending-keywords.                                   ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');

const router = express.Router();

// ─── GET /api/wm/summary ─ Snapshot agregado de las 4 tablas wm_* ───
//
// Devuelve el estado actual del cerebro de inteligencia: top países por
// CII, top focal points, top spikes de keywords, y los multi-source
// clusters más activos de las últimas horas. Pensado para consumirse
// desde el comando /world de Telegram y desde el dashboard.
router.get('/summary', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    const clusterHours = Math.min(parseInt(req.query.clusterHours, 10) || 6, 48);

    const [countries, focalPoints, trending, clusters, totals] = await Promise.all([
      db.queryAll(
        `SELECT code, name, score, level, trend, change_24h,
                component_unrest, component_conflict,
                component_security, component_information, last_seen
         FROM wm_country_scores
         ORDER BY score DESC, last_seen DESC
         LIMIT $1`,
        [limit]
      ),
      db.queryAll(
        `SELECT entity_id, entity_type, display_name,
                news_mentions, focal_score, urgency,
                top_headlines, last_seen
         FROM wm_focal_points
         ORDER BY focal_score DESC
         LIMIT $1`,
        [limit]
      ),
      db.queryAll(
        `SELECT term, mention_count, unique_sources,
                multiplier, baseline, confidence, last_seen
         FROM wm_trending_keywords
         ORDER BY mention_count DESC
         LIMIT $1`,
        [limit]
      ),
      db.queryAll(
        `SELECT cluster_key, primary_title, primary_source, primary_link,
                source_count, member_count, last_seen
         FROM wm_clusters
         WHERE source_count > 1
           AND last_seen >= NOW() - ($1::int * INTERVAL '1 hour')
         ORDER BY source_count DESC, last_seen DESC
         LIMIT $2`,
        [clusterHours, limit]
      ),
      db.queryOne(
        `SELECT
           (SELECT COUNT(*) FROM wm_clusters)            AS clusters_total,
           (SELECT COUNT(*) FROM wm_clusters WHERE source_count > 1) AS clusters_multi_source,
           (SELECT COUNT(*) FROM wm_focal_points)        AS focal_points_total,
           (SELECT COUNT(*) FROM wm_country_scores)      AS country_scores_total,
           (SELECT COUNT(*) FROM wm_trending_keywords)   AS trending_total,
           (SELECT MAX(updated_at) FROM wm_clusters)         AS clusters_last_update,
           (SELECT MAX(updated_at) FROM wm_focal_points)     AS focal_points_last_update,
           (SELECT MAX(updated_at) FROM wm_country_scores)   AS country_scores_last_update,
           (SELECT MAX(updated_at) FROM wm_trending_keywords) AS trending_last_update`
      ),
    ]);

    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      totals,
      top_countries: countries,
      top_focal_points: focalPoints,
      top_trending: trending,
      top_multi_source_clusters: clusters,
    });
  } catch (err) {
    console.error('❌ /api/wm/summary error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
