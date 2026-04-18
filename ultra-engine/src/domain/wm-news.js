const db = require('../db');

async function getNewsPulse() {
  const [volume, topByCont, spikes] = await Promise.all([
    db.queryOne(`
      SELECT
        count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '1 hour') AS h1,
        count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '6 hours') AS h6,
        count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '24 hours') AS h24,
        count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '48 hours') AS h48
      FROM rss_articles
      WHERE published_at >= NOW() - INTERVAL '48 hours'
    `),
    db.queryAll(`
      SELECT DISTINCT ON (continent)
        continent, title, source_name, relevance_score, published_at
      FROM v_news_by_topic
      WHERE published_at >= NOW() - INTERVAL '6 hours'
        AND continent IS NOT NULL
      ORDER BY continent, relevance_score DESC, published_at DESC
    `),
    db.queryAll(`
      SELECT topic, article_count, prev_count, velocity,
             sample_titles, computed_at
      FROM wm_topic_trends
      WHERE is_spike = true
      ORDER BY velocity DESC
      LIMIT 10
    `)
  ]);
  return { volume, top_by_continent: topByCont, topic_spikes: spikes };
}

module.exports = { getNewsPulse };
