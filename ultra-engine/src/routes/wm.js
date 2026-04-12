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

// ─── GET /api/wm/news/country/:iso ─ Top news per country ──────────
//
// Wraps the SQL function top_news_country(iso, limit, hours).
// Returns enriched articles with NLP data for a given country.
// Usage: GET /api/wm/news/country/PK?limit=20&hours=24
router.get('/news/country/:iso', async (req, res) => {
  try {
    const iso = String(req.params.iso).toUpperCase().slice(0, 2);
    if (!/^[A-Z]{2}$/.test(iso)) {
      return res.status(400).json({ ok: false, error: 'invalid ISO code' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168);

    const rows = await db.queryAll(
      `SELECT * FROM top_news_country($1, $2, $3)`,
      [iso, limit, hours]
    );

    res.json({ ok: true, country: iso, count: rows.length, data: rows });
  } catch (err) {
    console.error(`❌ /api/wm/news/country error:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/topic/:topic ─ Top news by topic ─────────────
router.get('/news/topic/:topic', async (req, res) => {
  try {
    const topic = String(req.params.topic).toLowerCase().slice(0, 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await db.queryAll(
      `SELECT article_id, title, url, published_at, relevance_score,
              source_name, lang, continent, subregion, sentiment_label, nlp_summary
       FROM v_news_by_topic
       WHERE primary_topic = $1
       ORDER BY relevance_score DESC, published_at DESC LIMIT $2`,
      [topic, limit]
    );
    res.json({ ok: true, topic, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/topic error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/topic/:topic/region/:region ──────────────────
router.get('/news/topic/:topic/region/:region', async (req, res) => {
  try {
    const topic = String(req.params.topic).toLowerCase().slice(0, 30);
    const region = String(req.params.region).slice(0, 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await db.queryAll(
      `SELECT article_id, title, url, published_at, relevance_score,
              source_name, lang, continent, subregion, sentiment_label, nlp_summary
       FROM v_news_by_topic
       WHERE primary_topic = $1 AND (subregion = $2 OR continent = $2)
       ORDER BY relevance_score DESC, published_at DESC LIMIT $3`,
      [topic, region, limit]
    );
    res.json({ ok: true, topic, region, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/topic/region error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/region/:region ───────────────────────────────
router.get('/news/region/:region', async (req, res) => {
  try {
    const region = String(req.params.region).slice(0, 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await db.queryAll(
      `SELECT article_id, title, url, published_at, relevance_score,
              source_name, lang, primary_topic, country_name, subregion, continent,
              sentiment_label, nlp_summary
       FROM v_news_by_region
       WHERE subregion = $1 OR continent = $1
       ORDER BY relevance_score DESC, published_at DESC LIMIT $2`,
      [region, limit]
    );
    res.json({ ok: true, region, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/region error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/country/:iso/topic/:topic ───────────────────
router.get('/news/country/:iso/topic/:topic', async (req, res) => {
  try {
    const iso = String(req.params.iso).toUpperCase().slice(0, 2);
    if (!/^[A-Z]{2}$/.test(iso)) {
      return res.status(400).json({ ok: false, error: 'invalid ISO code' });
    }
    const topic = String(req.params.topic).toLowerCase().slice(0, 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await db.queryAll(
      `SELECT article_id, title, url, published_at, relevance_score,
              source_name, lang, primary_topic, country_name, subregion, continent,
              sentiment_label, nlp_summary
       FROM v_news_by_country_topic
       WHERE country_iso = $1 AND (primary_topic = $2 OR secondary_topic = $2)
       ORDER BY relevance_score DESC, published_at DESC LIMIT $3`,
      [iso, topic, limit]
    );
    res.json({ ok: true, country: iso, topic, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/country/topic error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/summary ─ Executive summary ─────────────────
router.get('/news/summary', async (req, res) => {
  try {
    const [byContinentRaw, byTopicRaw, quality] = await Promise.all([
      db.queryAll(`
        SELECT continent, count(*) articles,
          count(DISTINCT source_name) sources,
          count(*) FILTER (WHERE relevance_score >= 8) high_score,
          round(avg(relevance_score)::numeric, 1) avg_score
        FROM v_news_by_topic
        GROUP BY continent ORDER BY articles DESC
      `),
      db.queryAll(`
        SELECT primary_topic, count(*) articles,
          count(*) FILTER (WHERE relevance_score >= 8) high_score,
          count(*) FILTER (WHERE sentiment_label = 'negative') negative,
          round(avg(relevance_score)::numeric, 1) avg_score
        FROM v_news_by_topic
        GROUP BY primary_topic ORDER BY high_score DESC, articles DESC LIMIT 10
      `),
      db.queryOne(`
        SELECT count(*) total_feeds,
          count(*) FILTER (WHERE articles_72h > 0) active_feeds,
          count(*) FILTER (WHERE articles_72h = 0) dead_feeds,
          round(avg(duplicate_pct)::numeric, 1) avg_dup_pct,
          round(avg(enriched_pct)::numeric, 1) avg_enrich_pct
        FROM v_feed_quality
      `)
    ]);

    // Top 3 articles per continent
    const topByContinent = {};
    for (const c of byContinentRaw) {
      const top = await db.queryAll(`
        SELECT title, source_name, relevance_score, published_at
        FROM v_news_by_topic
        WHERE continent = $1 ORDER BY relevance_score DESC, published_at DESC LIMIT 3
      `, [c.continent]);
      topByContinent[c.continent] = { ...c, top_articles: top };
    }

    res.json({
      ok: true,
      continents: topByContinent,
      topics: byTopicRaw,
      feed_health: quality
    });
  } catch (err) {
    console.error('❌ /api/wm/news/summary error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
