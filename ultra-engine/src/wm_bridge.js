// ════════════════════════════════════════════════════════════
//  WM Bridge — Phase 2
//
//  Conecta los servicios TypeScript de worldmonitor/ con el resto del
//  engine JS. Funciona porque el container arranca con
//  `node --require tsx/cjs server.js` (ver Dockerfile), por lo que
//  cualquier require('./worldmonitor/services/<x>') compila TS al vuelo
//  vía tsx + tsconfig.json (paths @/* → ./src/worldmonitor/*).
//
//  Phase 2 jobs cableados:
//   1. runClusteringJob   — rss_articles → clustering.ts → wm_clusters
//   2. runFocalPointJob   — clusters → focal-point-detector.ts → wm_focal_points
//
//  Otros bridges (country-instability, signal-aggregator real, etc.) vendrán
//  en commits separados a medida que se cableen.
// ════════════════════════════════════════════════════════════

const db = require('./db');

// ─── lazy require para que el módulo cargue rápido y solo invoque tsx
//      cuando alguien efectivamente llame a un job ──────────────────
let clusteringMod = null;
function loadClustering() {
  if (!clusteringMod) {
    clusteringMod = require('./worldmonitor/services/clustering');
  }
  return clusteringMod;
}

let focalPointMod = null;
function loadFocalPoint() {
  if (!focalPointMod) {
    focalPointMod = require('./worldmonitor/services/focal-point-detector');
  }
  return focalPointMod;
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

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 2: focal-point-detector
//
//  Pipeline:
//    rss_articles (24h) → clusterNews() → focalPointDetector.analyze()
//      → wm_focal_points
//
//  Por qué re-clusterizamos en vez de leer de wm_clusters:
//    el detector necesita ClusteredEvent[] con `allItems` (NewsItem[]) y
//    wm_clusters solo persiste metadata agregada — perder allItems rompe
//    entity-extraction. Re-clusterizar 1000 artículos cuesta ~1.5s así que
//    es más barato y simple que reconstruir el shape desde la BD.
//
//  Por qué pasamos un SignalSummary vacío:
//    signal-aggregator real depende de feeds que aún no están cableados
//    (military flights, internet outages, AIS, etc — fases posteriores).
//    El detector maneja signals=undefined sin ramas extras: si no hay
//    signals el signalScore=0 y solo puntúa por news. Cuando se wireen
//    los feeds reales, sustituimos esta línea por la salida real del
//    aggregator y todo el resto del pipeline sigue igual.
// ════════════════════════════════════════════════════════════

const EMPTY_SIGNAL_SUMMARY = Object.freeze({
  timestamp: new Date(0),
  totalSignals: 0,
  byType: {},
  convergenceZones: [],
  topCountries: [],
  aiContext: '',
});

/**
 * Persiste focal points. Idempotente vía entity_id (UNIQUE):
 * cuando el mismo entity reaparece en el run siguiente, hace UPDATE
 * de score/narrative/headlines y bumpea last_seen. first_seen solo se
 * setea en el INSERT inicial.
 */
async function persistFocalPoints(focalPoints) {
  let inserted = 0, updated = 0;
  for (const fp of focalPoints) {
    const r = await db.queryOne(
      `INSERT INTO wm_focal_points
         (entity_id, entity_type, display_name,
          news_mentions, news_velocity, top_headlines,
          signal_types, signal_count, high_severity_count,
          signal_descriptions, focal_score, urgency,
          narrative, correlation_evidence, raw,
          first_seen, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
       ON CONFLICT (entity_id) DO UPDATE SET
         display_name         = EXCLUDED.display_name,
         news_mentions        = EXCLUDED.news_mentions,
         news_velocity        = EXCLUDED.news_velocity,
         top_headlines        = EXCLUDED.top_headlines,
         signal_types         = EXCLUDED.signal_types,
         signal_count         = EXCLUDED.signal_count,
         high_severity_count  = EXCLUDED.high_severity_count,
         signal_descriptions  = EXCLUDED.signal_descriptions,
         focal_score          = EXCLUDED.focal_score,
         urgency              = EXCLUDED.urgency,
         narrative            = EXCLUDED.narrative,
         correlation_evidence = EXCLUDED.correlation_evidence,
         raw                  = EXCLUDED.raw,
         last_seen            = NOW(),
         updated_at           = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        String(fp.entityId).slice(0, 100),
        String(fp.entityType).slice(0, 30),
        String(fp.displayName || fp.entityId).slice(0, 200),
        Number.isFinite(fp.newsMentions) ? fp.newsMentions : 0,
        Number.isFinite(fp.newsVelocity) ? fp.newsVelocity : 0,
        JSON.stringify(Array.isArray(fp.topHeadlines) ? fp.topHeadlines : []),
        JSON.stringify(Array.isArray(fp.signalTypes) ? fp.signalTypes : []),
        Number.isFinite(fp.signalCount) ? fp.signalCount : 0,
        Number.isFinite(fp.highSeverityCount) ? fp.highSeverityCount : 0,
        JSON.stringify(Array.isArray(fp.signalDescriptions) ? fp.signalDescriptions : []),
        Number.isFinite(fp.focalScore) ? fp.focalScore : 0,
        ['watch','elevated','critical'].includes(fp.urgency) ? fp.urgency : 'watch',
        String(fp.narrative || '').slice(0, 2000),
        JSON.stringify(Array.isArray(fp.correlationEvidence) ? fp.correlationEvidence : []),
        JSON.stringify({ id: fp.id, focalScore: fp.focalScore, urgency: fp.urgency }),
      ]
    );
    if (r?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

/**
 * Job principal focal-point: pull articles → re-cluster → analyze → persist.
 *
 * Devuelve { articlesScanned, clustersUsed, focalPoints, criticalCount,
 *            elevatedCount, inserted, updated, durationMs }.
 */
async function runFocalPointJob({ lookbackHours = 24, limit = 1000 } = {}) {
  const t0 = Date.now();
  const articles = await fetchRecentArticles({ lookbackHours, limit });
  if (!articles.length) {
    return {
      articlesScanned: 0, clustersUsed: 0, focalPoints: 0,
      criticalCount: 0, elevatedCount: 0, inserted: 0, updated: 0,
      durationMs: Date.now() - t0,
    };
  }

  const { clusterNews } = loadClustering();
  const clusters = clusterNews(articles);

  const { focalPointDetector } = loadFocalPoint();
  const summary = focalPointDetector.analyze(clusters || [], EMPTY_SIGNAL_SUMMARY);

  const focalPoints = summary?.focalPoints || [];
  const criticalCount = focalPoints.filter(fp => fp.urgency === 'critical').length;
  const elevatedCount = focalPoints.filter(fp => fp.urgency === 'elevated').length;

  const persistResult = await persistFocalPoints(focalPoints);

  return {
    articlesScanned: articles.length,
    clustersUsed: clusters?.length || 0,
    focalPoints: focalPoints.length,
    criticalCount,
    elevatedCount,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

module.exports = {
  runClusteringJob,
  runFocalPointJob,
  fetchRecentArticles,  // exported for testing
  persistClusters,      // exported for testing
  persistFocalPoints,   // exported for testing
};
