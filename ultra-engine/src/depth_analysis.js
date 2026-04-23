// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Deep analysis layer                      ║
// ║                                                          ║
// ║  DEPTH-1: Semantic event clustering (cosine similarity)  ║
// ║  DEPTH-2: Event extraction (WHO/WHAT/WHERE/WHEN)         ║
// ║  DEPTH-4: Topic trend detection (velocity + spikes)      ║
// ║  DEPTH-5: Country sentiment aggregation                  ║
// ╚══════════════════════════════════════════════════════════╝

'use strict';

const db = require('./db');

// ═══════════════════════════════════════════════════════════
//  DEPTH-1: Semantic event clustering
//
//  Groups articles about the same event using cosine similarity
//  on embeddings from rss_articles_enrichment. Articles within
//  SIMILARITY_THRESHOLD of a cluster centroid get assigned.
//  New clusters created when no match found.
// ═══════════════════════════════════════════════════════════

const SIMILARITY_THRESHOLD = 0.72;
const CLUSTER_MAX_AGE_H = 48;

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function clusterArticles() {
  // Get unclustered articles with embeddings from last 24h
  const unclustered = await db.queryAll(`
    SELECT a.id, a.title, a.feed_id, e.embedding, e.sentiment_label,
           f.geo_scope_value as country
    FROM rss_articles a
    JOIN rss_articles_enrichment e ON e.article_id = a.id
    JOIN rss_feeds f ON f.id = a.feed_id
    WHERE a.event_cluster_id IS NULL
      AND e.embedding IS NOT NULL
      AND a.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY a.relevance_score DESC
    LIMIT 500
  `);
  if (unclustered.length === 0) return { clustered: 0, newClusters: 0 };

  // Load active clusters with centroids
  const clusters = await db.queryAll(`
    SELECT id, headline, centroid, article_count
    FROM wm_event_clusters
    WHERE status = 'active'
      AND last_updated > NOW() - INTERVAL '${CLUSTER_MAX_AGE_H} hours'
    ORDER BY last_updated DESC
    LIMIT 200
  `);

  let clustered = 0, newClusters = 0;

  for (const art of unclustered) {
    const emb = typeof art.embedding === 'string' ? JSON.parse(art.embedding) : art.embedding;
    if (!Array.isArray(emb) || emb.length === 0) continue;

    let bestCluster = null;
    let bestSim = 0;

    for (const c of clusters) {
      const centroid = typeof c.centroid === 'string' ? JSON.parse(c.centroid) : c.centroid;
      if (!centroid) continue;
      const sim = cosineSim(emb, centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestCluster = c;
      }
    }

    if (bestSim >= SIMILARITY_THRESHOLD && bestCluster) {
      // Assign to existing cluster
      await db.query('UPDATE rss_articles SET event_cluster_id = $1 WHERE id = $2', [bestCluster.id, art.id]);
      const countries = art.country ? [art.country] : [];
      await db.query(`
        UPDATE wm_event_clusters SET
          article_count = article_count + 1,
          last_updated = NOW(),
          countries = (SELECT array_agg(DISTINCT c) FROM unnest(countries || $2::text[]) c)
        WHERE id = $1`, [bestCluster.id, countries]);
      bestCluster.article_count++;
      clustered++;
    } else {
      // Create new cluster
      const row = await db.queryOne(`
        INSERT INTO wm_event_clusters (headline, first_seen, last_updated, article_count, countries, centroid)
        VALUES ($1, NOW(), NOW(), 1, $2, $3)
        RETURNING id`,
        [art.title.slice(0, 300), art.country ? [art.country] : [], JSON.stringify(emb)]
      );
      await db.query('UPDATE rss_articles SET event_cluster_id = $1 WHERE id = $2', [row.id, art.id]);
      clusters.push({ id: row.id, headline: art.title, centroid: emb, article_count: 1 });
      newClusters++;
      clustered++;
    }
  }

  // Expire old clusters
  await db.query(`
    UPDATE wm_event_clusters SET status = 'expired'
    WHERE status = 'active' AND last_updated < NOW() - INTERVAL '${CLUSTER_MAX_AGE_H} hours'`);

  return { clustered, newClusters, totalActive: clusters.length };
}


// ═══════════════════════════════════════════════════════════
//  DEPTH-2: Event extraction
//
//  Extracts structured events from clustered articles using
//  spaCy NER entities already stored. Identifies:
//  - event_type (from classify_topics or keywords)
//  - actors (PERSON/ORG entities)
//  - location (GPE/LOC entities)
//  - action (from title parsing)
// ═══════════════════════════════════════════════════════════

const EVENT_TYPES = {
  'conflict': ['attack', 'strike', 'bomb', 'kill', 'war', 'battle', 'assault', 'missile', 'shoot', 'fighting', 'invasion', 'offensive'],
  'diplomacy': ['talk', 'negotiat', 'summit', 'treaty', 'agreement', 'deal', 'ceasefire', 'peace', 'sanction', 'embargo', 'diplomat'],
  'election': ['elect', 'vote', 'poll', 'ballot', 'campaign', 'candidate', 'referendum'],
  'protest': ['protest', 'rally', 'demonstrat', 'riot', 'march', 'uprising', 'unrest'],
  'disaster': ['earthquake', 'flood', 'hurricane', 'cyclone', 'tsunami', 'wildfire', 'drought', 'tornado', 'volcano'],
  'economic': ['gdp', 'inflation', 'recession', 'tariff', 'trade war', 'stock', 'market crash', 'rate hike', 'default'],
  'military': ['deploy', 'troop', 'naval', 'blockade', 'drill', 'exercise', 'intercept', 'fleet', 'fighter jet'],
  'terrorism': ['terror', 'extremis', 'jihad', 'isis', 'al-qaeda', 'hostage', 'kidnap'],
  'health': ['pandemic', 'outbreak', 'epidemic', 'virus', 'vaccine', 'who declar', 'quarantine'],
  'cyber': ['hack', 'breach', 'ransomware', 'cyber attack', 'malware', 'zero-day', 'ddos'],
  'humanitarian': ['refugee', 'displac', 'famine', 'humanitarian', 'aid', 'crisis', 'evacuat'],
  'legal': ['court', 'ruling', 'verdict', 'indict', 'trial', 'arrest', 'extradite', 'warrant', 'icc'],
};

function detectEventType(text) {
  const lower = text.toLowerCase();
  const matches = [];
  for (const [type, keywords] of Object.entries(EVENT_TYPES)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matches.push(type);
        break;
      }
    }
  }
  return matches.length > 0 ? matches[0] : 'other';
}

async function extractEvents() {
  // Get clusters with 2+ articles that don't have events yet
  const clusters = await db.queryAll(`
    SELECT c.id, c.headline, c.countries, c.article_count
    FROM wm_event_clusters c
    LEFT JOIN wm_events ev ON ev.cluster_id = c.id
    WHERE c.status = 'active'
      AND c.article_count >= 2
      AND ev.id IS NULL
      AND c.created_at > NOW() - INTERVAL '48 hours'
    ORDER BY c.article_count DESC
    LIMIT 100
  `);

  let extracted = 0;
  for (const cluster of clusters) {
    // Get entities from articles in this cluster
    const articles = await db.queryAll(`
      SELECT a.title, a.entities, e.sentiment_label
      FROM rss_articles a
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE a.event_cluster_id = $1
      LIMIT 10`, [cluster.id]);

    // Aggregate entities across articles
    const persons = new Set();
    const orgs = new Set();
    const locations = new Set();

    for (const art of articles) {
      if (!art.entities) continue;
      const ents = typeof art.entities === 'string' ? JSON.parse(art.entities) : art.entities;
      if (Array.isArray(ents)) {
        for (const e of ents) {
          if (e.label === 'PERSON' || e.label === 'PER') persons.add(e.text);
          else if (e.label === 'ORG') orgs.add(e.text);
          else if (e.label === 'GPE' || e.label === 'LOC') locations.add(e.text);
        }
      }
    }

    const eventType = detectEventType(cluster.headline);
    const actors = {
      persons: [...persons].slice(0, 10),
      organizations: [...orgs].slice(0, 10),
    };
    const location = [...locations].slice(0, 5).join(', ') || null;
    const locationGeo = cluster.countries?.[0] || null;

    await db.query(`
      INSERT INTO wm_events (cluster_id, event_type, actors, action, location, location_geo, source_count, confidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        cluster.id,
        eventType,
        JSON.stringify(actors),
        cluster.headline.slice(0, 300),
        location,
        locationGeo,
        cluster.article_count,
        Math.min(0.95, 0.4 + cluster.article_count * 0.05),
      ]
    );
    extracted++;
  }

  return { extracted, candidates: clusters.length };
}


// ═══════════════════════════════════════════════════════════
//  DEPTH-4: Topic trend detection
//
//  Computes article volume per NLP topic across time windows
//  (1h, 6h, 24h). Detects spikes when current volume exceeds
//  2× the previous window average.
// ═══════════════════════════════════════════════════════════

async function detectTrends() {
  const windows = [1, 6, 24];
  let spikes = 0, total = 0;

  for (const hours of windows) {
    // Count from feed primary_topic
    const feedTopics = await db.queryAll(`
      SELECT f.primary_topic as topic, COUNT(*) as cnt,
        ARRAY_AGG(a.title ORDER BY a.relevance_score DESC) as titles
      FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      WHERE a.created_at > NOW() - INTERVAL '${hours} hours'
        AND f.primary_topic IS NOT NULL
      GROUP BY f.primary_topic
    `);

    const feedTopicsPrev = await db.queryAll(`
      SELECT f.primary_topic as topic, COUNT(*) as cnt
      FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      WHERE a.created_at BETWEEN NOW() - INTERVAL '${hours * 2} hours'
                              AND NOW() - INTERVAL '${hours} hours'
        AND f.primary_topic IS NOT NULL
      GROUP BY f.primary_topic
    `);

    const prevMap = {};
    for (const r of feedTopicsPrev) prevMap[r.topic] = Number(r.cnt);

    for (const r of feedTopics) {
      const cnt = Number(r.cnt);
      const prevCnt = prevMap[r.topic] || 0;
      const velocity = prevCnt > 0 ? ((cnt - prevCnt) / prevCnt * 100) : (cnt > 3 ? 999 : 0);
      const isSpike = cnt >= 5 && velocity > 100;
      const sampleTitles = (r.titles || []).slice(0, 5);

      await db.query(`
        INSERT INTO wm_topic_trends (topic, window_hours, article_count, prev_count, velocity, is_spike, sample_titles)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [r.topic, hours, cnt, prevCnt, velocity, isSpike, JSON.stringify(sampleTitles)]
      );
      total++;
      if (isSpike) spikes++;
    }
  }

  return { total, spikes };
}


// ═══════════════════════════════════════════════════════════
//  DEPTH-5: Country sentiment aggregation
//
//  Aggregates NLP sentiment per country per day. Tracks
//  positive/neutral/negative percentages and top articles.
// ═══════════════════════════════════════════════════════════

async function aggregateCountrySentiment() {
  const rows = await db.queryAll(`
    SELECT f.geo_scope_value as country,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE e.sentiment_label = 'positive') as pos,
      COUNT(*) FILTER (WHERE e.sentiment_label = 'neutral') as neu,
      COUNT(*) FILTER (WHERE e.sentiment_label = 'negative') as neg,
      AVG(e.sentiment_score) as avg_score
    FROM rss_articles a
    JOIN rss_feeds f ON f.id = a.feed_id
    JOIN rss_articles_enrichment e ON e.article_id = a.id
    WHERE f.geo_scope = 'country'
      AND a.created_at > CURRENT_DATE
      AND e.sentiment_label IS NOT NULL
    GROUP BY f.geo_scope_value
    HAVING COUNT(*) >= 3
  `);

  let updated = 0;
  for (const r of rows) {
    const total = Number(r.total);
    // Get top positive and negative articles for context
    const topPos = await db.queryOne(`
      SELECT a.title FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE f.geo_scope_value = $1 AND e.sentiment_label = 'positive'
        AND a.created_at > CURRENT_DATE
      ORDER BY e.sentiment_score DESC LIMIT 1`, [r.country]);

    const topNeg = await db.queryOne(`
      SELECT a.title FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE f.geo_scope_value = $1 AND e.sentiment_label = 'negative'
        AND a.created_at > CURRENT_DATE
      ORDER BY e.sentiment_score DESC LIMIT 1`, [r.country]);

    await db.query(`
      INSERT INTO wm_country_sentiment
        (country_iso2, period_date, article_count, positive_pct, neutral_pct, negative_pct, avg_score, top_positive, top_negative)
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (country_iso2, period_date) DO UPDATE SET
        article_count = EXCLUDED.article_count,
        positive_pct = EXCLUDED.positive_pct,
        neutral_pct = EXCLUDED.neutral_pct,
        negative_pct = EXCLUDED.negative_pct,
        avg_score = EXCLUDED.avg_score,
        top_positive = EXCLUDED.top_positive,
        top_negative = EXCLUDED.top_negative,
        computed_at = NOW()`,
      [
        r.country,
        total,
        (Number(r.pos) / total * 100).toFixed(1),
        (Number(r.neu) / total * 100).toFixed(1),
        (Number(r.neg) / total * 100).toFixed(1),
        r.avg_score,
        topPos ? JSON.stringify({ title: topPos.title }) : null,
        topNeg ? JSON.stringify({ title: topNeg.title }) : null,
      ]
    );
    updated++;
  }

  return { countries: updated };
}


module.exports = {
  clusterArticles,
  extractEvents,
  detectTrends,
  aggregateCountrySentiment,
};
