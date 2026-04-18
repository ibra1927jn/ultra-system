const express = require('express');
const db = require('../../db');
const { COUNTRY_ALIASES, TOPIC_KEYWORDS, getCountryTerms, buildTopicRegex, buildCountryRegex } = require('./constants');
const { cacheMiddleware, filteredCache } = require('./cache');
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

    // Top 3 articles per continent (single query with window function)
    const topArticles = await db.queryAll(`
      SELECT * FROM (
        SELECT continent, title, source_name, relevance_score, published_at,
               ROW_NUMBER() OVER (PARTITION BY continent ORDER BY relevance_score DESC, published_at DESC) AS rn
        FROM v_news_by_topic
        WHERE continent IS NOT NULL
      ) ranked WHERE rn <= 3
    `);
    const topByContinent = {};
    for (const c of byContinentRaw) {
      topByContinent[c.continent] = {
        ...c,
        top_articles: topArticles.filter(a => a.continent === c.continent).map(({ rn, ...rest }) => rest)
      };
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

// ═════��═════════════════════════════════════════════════════
//  MAP ENDPOINTS — /api/wm/map/*
//  Datos para el WorldMonitor interactivo (Leaflet)
// ═════���════════════════════��════════════════════════════════

// ─── GET /api/wm/map/flights ─ Latest flight snapshot ─────
// ?type=military|commercial|all (default all)
router.get('/news/filtered', cacheMiddleware(filteredCache), async (req, res) => {
  try {
    const level = String(req.query.level || 'world').toLowerCase();
    const value = req.query.value || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168);

    // Parse topics (comma-separated) — if empty, no topic filter
    let topics = null;
    if (req.query.topics) {
      topics = String(req.query.topics).split(',').map(t => t.trim()).filter(Boolean);
      if (!topics.length) topics = null;
    }

    // Build WHERE clauses dynamically
    const conditions = [
      `published_at >= NOW() - ($1::int * INTERVAL '1 hour')`,
    ];
    const params = [hours];
    let paramIdx = 2;

    // Full-text search
    const search = req.query.search ? String(req.query.search).trim().slice(0, 100) : null;
    if (search) {
      conditions.push(`title ILIKE '%' || $${paramIdx} || '%'`);
      params.push(search);
      paramIdx++;
    }

    // Topic filter (EXPANDED: primary_topic OR secondary_topic OR title regex match)
    // Uses single regex with trigram GIN index for fast multi-keyword matching.
    // When topic filter is active, we exclude social media feeds (Bluesky) to
    // prioritize real journalism over short noisy posts. Saves ~4x query time.
    if (topics) {
      const regex = buildTopicRegex(topics);
      conditions.push(`source_name NOT ILIKE '%bluesky%'`);
      if (regex) {
        conditions.push(`(primary_topic = ANY($${paramIdx}::text[]) OR secondary_topic = ANY($${paramIdx}::text[]) OR title ~* $${paramIdx + 1})`);
        params.push(topics);
        params.push(regex);
        paramIdx += 2;
      } else {
        conditions.push(`(primary_topic = ANY($${paramIdx}::text[]) OR secondary_topic = ANY($${paramIdx}::text[]))`);
        params.push(topics);
        paramIdx++;
      }
    }

    // Geo filter based on drill-down level
    // v_news_by_topic has: geo_scope ('country','subregion','continent','global'),
    //   geo_scope_value (ISO2 for country, name for subregion/continent),
    //   subregion, continent
    if (level === 'continent' && value) {
      conditions.push(`continent = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    } else if (level === 'subregion' && value) {
      conditions.push(`(subregion = $${paramIdx} OR continent = $${paramIdx})`);
      params.push(value);
      paramIdx++;
    } else if (level === 'country' && value) {
      const iso = String(value).toUpperCase().slice(0, 2);
      // Expanded country filter via regex (leverages trigram index):
      // 1. Feed-scoped articles (original behavior)
      // 2. OR articles mentioning country name in any major language
      const terms = getCountryTerms(iso);
      if (terms.length > 1) {
        const regex = buildCountryRegex(terms);
        const termParamIdx = paramIdx + 1;
        conditions.push(`((geo_scope = 'country' AND geo_scope_value = $${paramIdx}) OR title ~* $${termParamIdx} OR COALESCE(nlp_summary,'') ~* $${termParamIdx})`);
        params.push(iso);
        params.push(regex);
        paramIdx += 2;
      } else {
        conditions.push(`(geo_scope = 'country' AND geo_scope_value = $${paramIdx})`);
        params.push(iso);
        paramIdx++;
      }
    }
    // level === 'world' → no geo filter

    params.push(limit);
    const limitParam = `$${paramIdx}`;

    const sql = `
      SELECT article_id, title, url, published_at, relevance_score,
             source_name, lang, continent, subregion,
             geo_scope_value AS country_iso,
             primary_topic, sentiment_label, nlp_summary
      FROM v_news_by_topic
      WHERE ${conditions.join(' AND ')}
      ORDER BY relevance_score DESC, published_at DESC
      LIMIT ${limitParam}
    `;

    const rows = await db.queryAll(sql, params);

    res.json({
      ok: true,
      level,
      value: value || 'world',
      topics: topics || 'all',
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('❌ /api/wm/news/filtered error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/activity ─ Article counts per country (last N hours) ──
// Used by the WorldMap Regions tab to show live activity badges
router.get('/news/activity', async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours, 10) || 48, 168);
    const rows = await db.queryAll(`
      SELECT geo_scope_value AS country_iso,
             country_name,
             continent,
             subregion,
             count(*) AS article_count,
             count(*) FILTER (WHERE relevance_score >= 7) AS high_score,
             count(*) FILTER (WHERE sentiment_label = 'negative') AS negative,
             count(*) FILTER (WHERE sentiment_label = 'positive') AS positive,
             round(avg(relevance_score)::numeric, 1) AS avg_score
      FROM v_news_by_topic
      WHERE published_at >= NOW() - ($1::int * INTERVAL '1 hour')
        AND geo_scope = 'country'
        AND geo_scope_value IS NOT NULL
      GROUP BY geo_scope_value, country_name, continent, subregion
      ORDER BY article_count DESC
    `, [hours]);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/activity error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/timeline ─ Daily article volume per country (7 days) ──
// Returns sparkline data for hover cards and country detail views
router.get('/news/timeline', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 7, 14);
    const rows = await db.queryAll(`
      SELECT f.geo_scope_value AS country_iso,
             date_trunc('day', a.published_at)::date AS day,
             count(*) AS articles,
             count(*) FILTER (WHERE COALESCE(e.sentiment_label, a.sentiment_label) = 'negative') AS negative
      FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE a.published_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND f.geo_scope = 'country'
        AND f.geo_scope_value IS NOT NULL
      GROUP BY f.geo_scope_value, date_trunc('day', a.published_at)::date
      ORDER BY country_iso, day
    `, [days]);
    // Group by country for easy frontend consumption
    const byCountry = {};
    rows.forEach(r => {
      if (!byCountry[r.country_iso]) byCountry[r.country_iso] = [];
      byCountry[r.country_iso].push({ day: r.day, articles: parseInt(r.articles), negative: parseInt(r.negative) });
    });
    res.json({ ok: true, days, data: byCountry });
  } catch (err) {
    console.error('❌ /api/wm/news/timeline error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/pulse ─ Global real-time pulse ────────────────────────
// Returns volume counts at different time windows + top stories per continent
router.get('/news/pulse', async (req, res) => {
  try {
    const result = await require('../../domain/wm-news').getNewsPulse();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('❌ /api/wm/news/pulse error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/markets/snapshot ─ Key financial data for dashboard ────────

module.exports = router;
