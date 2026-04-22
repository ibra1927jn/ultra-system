const express = require('express');
const db = require('../../db');
const router = express.Router();

router.get('/compare', async (req, res) => {
  try {
    const raw = String(req.query.isos || '').trim();
    if (!raw) return res.status(400).json({ ok: false, error: 'provide isos=XX,YY,ZZ' });
    const isos = raw.split(',').map(s => s.toUpperCase().trim()).filter(s => /^[A-Z]{2}$/.test(s)).slice(0, 4);
    if (!isos.length) return res.status(400).json({ ok: false, error: 'no valid ISO codes' });
    const hours = Math.min(parseInt(req.query.hours, 10) || 48, 168);

    const [activity, sentiment, scores, alerts, timeline] = await Promise.all([
      db.queryAll(`
        SELECT geo_scope_value AS iso, country_name,
               count(*) AS article_count,
               count(*) FILTER (WHERE relevance_score >= 7) AS high_score,
               count(*) FILTER (WHERE sentiment_label = 'negative') AS negative,
               count(*) FILTER (WHERE sentiment_label = 'positive') AS positive,
               round(avg(relevance_score)::numeric, 1) AS avg_score
        FROM v_news_by_topic
        WHERE published_at >= NOW() - ($1::int * INTERVAL '1 hour')
          AND geo_scope = 'country' AND geo_scope_value = ANY($2::text[])
        GROUP BY geo_scope_value, country_name
      `, [hours, isos]),
      db.queryAll(`
        SELECT country_iso2 AS iso, positive_pct, neutral_pct, negative_pct, avg_score
        FROM wm_country_sentiment
        WHERE country_iso2 = ANY($1::text[])
          AND period_date >= CURRENT_DATE - INTERVAL '3 days'
        ORDER BY country_iso2, period_date DESC
      `, [isos]),
      db.queryAll(`
        SELECT code AS iso, score, level, trend, change_24h,
               component_unrest, component_conflict, component_security, component_information
        FROM wm_country_scores
        WHERE code = ANY($1::text[])
      `, [isos]),
      db.queryAll(`
        SELECT country AS iso, z_score, severity, top_title, current_volume
        FROM wm_gdelt_volume_alerts
        WHERE country = ANY($1::text[])
          AND alert_date >= CURRENT_DATE - INTERVAL '3 days'
        ORDER BY country, z_score DESC
      `, [isos]),
      db.queryAll(`
        SELECT f.geo_scope_value AS iso,
               date_trunc('day', a.published_at)::date AS day,
               count(*) AS articles
        FROM rss_articles a
        JOIN rss_feeds f ON f.id = a.feed_id
        WHERE f.geo_scope = 'country' AND f.geo_scope_value = ANY($1::text[])
          AND a.published_at >= NOW() - INTERVAL '7 days'
        GROUP BY f.geo_scope_value, date_trunc('day', a.published_at)
        ORDER BY iso, day
      `, [isos]),
    ]);

    // Top article per country (separate query to avoid N+1)
    const topArticles = await db.queryAll(`
      SELECT DISTINCT ON (geo_scope_value)
        geo_scope_value AS iso, title, url, published_at, source_name, relevance_score
      FROM v_news_by_topic
      WHERE geo_scope = 'country' AND geo_scope_value = ANY($1::text[])
        AND published_at >= NOW() - ($2::int * INTERVAL '1 hour')
      ORDER BY geo_scope_value, relevance_score DESC, published_at DESC
    `, [isos, hours]);

    // Build result per country
    const result = isos.map(iso => {
      const act = activity.find(a => a.iso === iso);
      const sent = sentiment.find(s => s.iso === iso);
      const sc = scores.find(s => s.iso === iso);
      const al = alerts.find(a => a.iso === iso);
      const tl = timeline.filter(t => t.iso === iso).map(t => ({ day: t.day, articles: parseInt(t.articles) }));
      const top = topArticles.find(t => t.iso === iso);
      return {
        iso,
        name: act?.country_name || null,
        activity: act ? {
          article_count: parseInt(act.article_count),
          high_score: parseInt(act.high_score),
          negative: parseInt(act.negative),
          positive: parseInt(act.positive),
          avg_score: parseFloat(act.avg_score),
        } : null,
        sentiment: sent ? {
          positive_pct: parseFloat(sent.positive_pct),
          neutral_pct: parseFloat(sent.neutral_pct),
          negative_pct: parseFloat(sent.negative_pct),
        } : null,
        risk: sc ? {
          score: parseFloat(sc.score),
          level: sc.level,
          trend: sc.trend,
          change_24h: parseFloat(sc.change_24h),
          components: {
            unrest: sc.component_unrest,
            conflict: sc.component_conflict,
            security: sc.component_security,
            information: sc.component_information,
          }
        } : null,
        alert: al || null,
        timeline: tl,
        top_article: top || null,
      };
    });

    res.json({ ok: true, hours, count: result.length, data: result });
  } catch (err) {
    console.error('❌ /api/wm/compare error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/article/:id ─ Full article details for in-place reading ──
// Returns article + enrichment + cluster siblings. Used by the news reader
// in worldmap.html so users don't have to open the source URL to read.

module.exports = router;
