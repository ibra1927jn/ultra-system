// ════════════════════════════════════════════════════════════
//  WM Bridge — Phase 2
//
//  Conecta los servicios TypeScript de worldmonitor/ con el resto del
//  engine JS. Funciona porque el container arranca con
//  `node --require tsx/cjs server.js` (ver Dockerfile), por lo que
//  cualquier require('./worldmonitor/services/<x>') compila TS al vuelo
//  vía tsx + tsconfig.json (paths @/* → ./src/worldmonitor/*).
//
//  Phase 2 — Job 1: clustering en vivo sobre rss_articles → wm_clusters.
//  Otros bridges (entity-extraction, threat scoring, focal-point, etc.)
//  vendrán en commits separados a medida que se cableen.
// ════════════════════════════════════════════════════════════

const db = require('./db');

// ─── lazy require para que el módulo cargue rápido y solo invoque tsx
//      cuando alguien efectivamente llame a runClusteringJob ────────
let clusteringMod = null;
function loadClustering() {
  if (!clusteringMod) {
    clusteringMod = require('./worldmonitor/services/clustering');
  }
  return clusteringMod;
}

/**
 * Pull artículos RSS recientes de la BD y mapéalos a la shape NewsItem
 * que esperan los servicios WM.
 *
 * Estrategia de mapeo:
 *  - source: rss_feeds.name (o 'unknown' si feed huérfano)
 *  - title: rss_articles.title
 *  - link: rss_articles.url
 *  - pubDate: rss_articles.published_at (Date object)
 *  - isAlert: false (los artículos son news normales — alerts vienen de USGS/WHO etc.)
 *  - tier: rss_feeds.tier (default 4 = lowest tier)
 *  - lang: rss_feeds.lang (default 'en')
 */
async function fetchRecentArticles({ lookbackHours = 24, limit = 1000 } = {}) {
  const rows = await db.queryAll(
    `SELECT
       a.id          AS article_id,
       a.title       AS title,
       a.url         AS link,
       a.published_at AS pub_date,
       COALESCE(f.name, 'unknown')    AS source,
       COALESCE(f.tier, 4)            AS tier,
       COALESCE(f.lang, 'en')         AS lang
     FROM rss_articles a
     LEFT JOIN rss_feeds f ON f.id = a.feed_id
     WHERE a.published_at IS NOT NULL
       AND a.published_at >= NOW() - ($1::int * INTERVAL '1 hour')
       AND a.duplicate_of IS NULL
     ORDER BY a.published_at DESC
     LIMIT $2`,
    [lookbackHours, limit]
  );

  return rows.map(r => ({
    source: String(r.source).slice(0, 100),
    title: String(r.title || '').slice(0, 500),
    link: String(r.link || ''),
    pubDate: new Date(r.pub_date),
    isAlert: false,
    tier: Number.isFinite(+r.tier) ? +r.tier : 4,
    lang: String(r.lang || 'en').slice(0, 5),
  }));
}

/**
 * Persiste los clusters en wm_clusters. Idempotente vía cluster_key (UNIQUE):
 * si el mismo cluster ya existe, hace UPDATE de last_seen + member_count
 * + threat (re-evaluación). Esto deja el conteo agregado sumado a lo largo
 * del tiempo en vez de reemplazarlo.
 */
async function persistClusters(clusters) {
  let inserted = 0, updated = 0;
  for (const c of clusters) {
    const memberCount = Array.isArray(c.members) ? c.members.length : (c.sourceCount || 1);
    const threat = c.threat || {};
    const dates = (c.members || []).map(m => m?.pubDate).filter(Boolean).map(d => new Date(d));
    const firstSeen = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date();
    const lastSeen = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date();

    const r = await db.queryOne(
      `INSERT INTO wm_clusters
         (cluster_key, primary_title, primary_source, primary_link,
          source_count, top_sources, threat_level, threat_category,
          threat_confidence, first_seen, last_seen, member_count, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (cluster_key) DO UPDATE SET
         primary_title = EXCLUDED.primary_title,
         primary_source = EXCLUDED.primary_source,
         primary_link = EXCLUDED.primary_link,
         source_count = GREATEST(wm_clusters.source_count, EXCLUDED.source_count),
         top_sources = EXCLUDED.top_sources,
         threat_level = COALESCE(EXCLUDED.threat_level, wm_clusters.threat_level),
         threat_category = COALESCE(EXCLUDED.threat_category, wm_clusters.threat_category),
         threat_confidence = COALESCE(EXCLUDED.threat_confidence, wm_clusters.threat_confidence),
         last_seen = GREATEST(wm_clusters.last_seen, EXCLUDED.last_seen),
         member_count = GREATEST(wm_clusters.member_count, EXCLUDED.member_count),
         raw = EXCLUDED.raw,
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        String(c.id || `wm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        String(c.primaryTitle || 'untitled').slice(0, 1000),
        c.primarySource || null,
        c.primaryLink || null,
        c.sourceCount || 1,
        c.topSources ? JSON.stringify(c.topSources) : null,
        threat.level || null,
        threat.category || null,
        threat.confidence != null ? threat.confidence : null,
        firstSeen,
        lastSeen,
        memberCount,
        JSON.stringify({ id: c.id, sourceCount: c.sourceCount, topSources: c.topSources, threat }),
      ]
    );
    if (r?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

/**
 * Job principal: pull articles → cluster → persist.
 *
 * Devuelve { articlesScanned, clustersFound, inserted, updated, durationMs }.
 * Este shape se usa por el cron handler en scheduler.js para logging.
 */
async function runClusteringJob({ lookbackHours = 24, limit = 1000 } = {}) {
  const t0 = Date.now();
  const articles = await fetchRecentArticles({ lookbackHours, limit });
  if (!articles.length) {
    return { articlesScanned: 0, clustersFound: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0 };
  }

  const { clusterNews } = loadClustering();
  const clusters = clusterNews(articles);

  const persistResult = await persistClusters(clusters || []);

  return {
    articlesScanned: articles.length,
    clustersFound: clusters?.length || 0,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

module.exports = {
  runClusteringJob,
  fetchRecentArticles,  // exported for testing
  persistClusters,      // exported for testing
};
