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
//   1. runClusteringJob          — rss_articles → clustering.ts → wm_clusters
//   2. runFocalPointJob          — clusters → focal-point-detector.ts → wm_focal_points
//   3. runCountryInstabilityJob  — clusters → country-instability.ts → wm_country_scores
//   4. runTrendingKeywordsJob    — articles → trending-keywords.ts → wm_trending_keywords
//   5. runMilitaryFlightsJob     — OpenSky direct OAuth2 → military-flights.ts → wm_military_flights
//   6. runUSNIFleetJob           — usni_scraper.js (puppeteer HTML) → wm_usni_fleet
//   7. runMilitaryVesselsJob     — aisstream_subscriber.js (WebSocket) → wm_military_vessels
//   8. runSignalAggregatorJob    — flights+vessels → signal-aggregator.ts singleton → wm_signal_summary
//
//  Otros bridges (internet outages, etc.) vendrán en commits separados.
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

let ciiMod = null;
function loadCII() {
  if (!ciiMod) {
    ciiMod = require('./worldmonitor/services/country-instability');
  }
  return ciiMod;
}

let militaryFlightsMod = null;
function loadMilitaryFlights() {
  if (!militaryFlightsMod) {
    militaryFlightsMod = require('./worldmonitor/services/military-flights');
  }
  return militaryFlightsMod;
}

let usniMod = null;
function loadUsni() {
  if (!usniMod) {
    usniMod = require('./usni_scraper');
  }
  return usniMod;
}

let signalAggregatorMod = null;
function loadSignalAggregator() {
  if (!signalAggregatorMod) {
    signalAggregatorMod = require('./worldmonitor/services/signal-aggregator');
  }
  return signalAggregatorMod;
}

let trendingMod = null;
let trendingConfigured = false;
function loadTrending() {
  if (!trendingMod) {
    trendingMod = require('./worldmonitor/services/trending-keywords');
    // Disable autoSummarize on first load: summarization.ts is a Phase 1
    // stub (NewsServiceClient.summarizeArticle not implemented) and would
    // spam logs with 'News Summarization Failed' + 300s cooldowns on every
    // cron run. The spike detection itself works fine without summaries.
    // When summarization gets wired in a future phase, flip this back on.
    if (!trendingConfigured) {
      try {
        trendingMod.updateTrendingConfig({ autoSummarize: false });
        trendingConfigured = true;
      } catch (err) {
        console.warn('⚠️  trending-keywords config update failed:', err.message);
      }
    }
  }
  return trendingMod;
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
 * Get the current SignalSummary from the signal-aggregator singleton.
 *
 * Returns the live aggregated state if the aggregator has any signals
 * (typically populated by the most recent runSignalAggregatorJob run),
 * or EMPTY_SIGNAL_SUMMARY if the aggregator is cold (engine just booted,
 * no signal-aggregator cron has fired yet).
 *
 * Used by runFocalPointJob and runCountryInstabilityJob to feed the
 * downstream services with REAL signal data instead of an empty summary.
 * That activates urgencies elevated/critical in focal-point-detector and
 * the security component in country-instability.
 */
function getCurrentSignalSummary() {
  try {
    const sa = loadSignalAggregator();
    if (sa.signalAggregator.getSignalCount() === 0) {
      return EMPTY_SIGNAL_SUMMARY;
    }
    return sa.signalAggregator.getSummary();
  } catch (err) {
    console.warn('⚠️  getCurrentSignalSummary failed, falling back to empty:', err.message);
    return EMPTY_SIGNAL_SUMMARY;
  }
}

/**
 * Pull recent military flight rows from wm_military_flights and reshape
 * them as MilitaryFlight objects suitable for signalAggregator.ingestFlights
 * and country-instability.ingestMilitaryForCII.
 *
 * Used inside runSignalAggregatorJob and runCountryInstabilityJob.
 *
 * Why pull from DB rather than calling fetchMilitaryFlights() again:
 *  - DB already has the most recent snapshot from the wm-military-flights
 *    cron (runs at *\/5)
 *  - Avoids hitting OpenSky again (rate limit budget) and re-doing work
 *  - Returns a deterministic snapshot based on observed_at, which is what
 *    we want for signal aggregation
 */
async function getRecentMilitaryFlights({ lookbackMinutes = 10 } = {}) {
  const rows = await db.queryAll(
    `SELECT icao24, callsign, aircraft_type, aircraft_model,
            operator, operator_country,
            lat, lon, altitude_ft, heading_deg, speed_kt,
            vertical_rate_fpm, on_ground, squawk,
            confidence, is_interesting, hotspot, note,
            observed_at
     FROM wm_military_flights
     WHERE observed_at >= NOW() - ($1::int * INTERVAL '1 minute')
     ORDER BY observed_at DESC
     LIMIT 5000`,
    [lookbackMinutes]
  );
  // Reshape DB rows back into MilitaryFlight shape (camelCase, dates).
  // Keeps the WM signal-aggregator code unchanged.
  return rows.map(r => ({
    id: `db-${r.icao24}-${new Date(r.observed_at).getTime()}`,
    callsign: r.callsign || `UNK-${r.icao24}`,
    hexCode: String(r.icao24).toUpperCase(),
    aircraftType: r.aircraft_type || 'unknown',
    aircraftModel: r.aircraft_model || undefined,
    operator: r.operator || 'other',
    operatorCountry: r.operator_country || 'Unknown',
    lat: Number(r.lat),
    lon: Number(r.lon),
    altitude: Number(r.altitude_ft) || 0,
    heading: Number(r.heading_deg) || 0,
    speed: Number(r.speed_kt) || 0,
    verticalRate: r.vertical_rate_fpm != null ? Number(r.vertical_rate_fpm) : undefined,
    onGround: Boolean(r.on_ground),
    squawk: r.squawk || undefined,
    confidence: r.confidence || 'low',
    isInteresting: Boolean(r.is_interesting),
    note: r.note || undefined,
    lastSeen: new Date(r.observed_at),
  }));
}

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
  // Use the LIVE SignalSummary from the signal-aggregator singleton if it
  // has data (populated by the wm-signal-aggregator cron). This is what
  // unlocks urgencies elevated/critical in focal-point output. Falls back
  // to EMPTY when the aggregator is cold (e.g. engine just rebooted).
  const signalSummary = getCurrentSignalSummary();
  const summary = focalPointDetector.analyze(clusters || [], signalSummary);

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

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 3: country-instability (CII)
//
//  Pipeline:
//    rss_articles (24h) → clusterNews() → focalPointDetector.analyze()
//      → ingestNewsForCII(clusters) → calculateCII() → wm_country_scores
//
//  Por qué corremos focal-point ANTES dentro del mismo job:
//    country-instability.ts línea 614 hace
//      const focalUrgencies = focalPointDetector.getCountryUrgencyMap();
//    El detector es un singleton con estado lastSummary. Si nadie ha
//    llamado a analyze() antes, el map está vacío y el focalBoost siempre
//    es 0. El cron wm-focal-points dispara a :40 y este a :50 — entre
//    medias el singleton ya tiene state, pero arrancamos analyze() de
//    nuevo aquí dentro del mismo proceso para garantizar que el state
//    está fresco si el orden cambia o el engine se reinicia entre runs.
//
//  Por qué llamamos clearCountryData() antes de cada run:
//    countryDataMap es estado in-memory acumulativo. Sin clear, las
//    noticias del run anterior se suman a las del nuevo run y los
//    contadores explotan con el tiempo. clearCountryData() lo resetea
//    a {}. Las previousScores (para change_24h) NO se borran — están
//    en otro Map y se preservan entre runs como diseñado.
//
//  Modo news-only:
//    Sin protests/military/conflicts/displacement/climate ingerido
//    todavía, los componentes unrest/conflict/security son 0 y solo
//    information+baselineRisk+focalBoost contribuyen al score. Igual
//    que con focal-point: cuando los feeds reales se cableen, esos
//    ingest* se llaman aquí dentro y el resto del pipeline sigue igual.
// ════════════════════════════════════════════════════════════

/**
 * Persiste country scores. Idempotente vía code (UNIQUE):
 * cuando el mismo país reaparece, hace UPDATE de score/level/trend/
 * change_24h/components y bumpea last_seen.
 */
async function persistCountryScores(scores) {
  let inserted = 0, updated = 0;
  for (const s of scores) {
    const r = await db.queryOne(
      `INSERT INTO wm_country_scores
         (code, name, score, level, trend, change_24h,
          component_unrest, component_conflict,
          component_security, component_information,
          raw, first_seen, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       ON CONFLICT (code) DO UPDATE SET
         name                  = EXCLUDED.name,
         score                 = EXCLUDED.score,
         level                 = EXCLUDED.level,
         trend                 = EXCLUDED.trend,
         change_24h            = EXCLUDED.change_24h,
         component_unrest      = EXCLUDED.component_unrest,
         component_conflict    = EXCLUDED.component_conflict,
         component_security    = EXCLUDED.component_security,
         component_information = EXCLUDED.component_information,
         raw                   = EXCLUDED.raw,
         last_seen             = NOW(),
         updated_at            = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        String(s.code).slice(0, 10),
        String(s.name || s.code).slice(0, 100),
        Number.isFinite(s.score) ? Math.round(s.score) : 0,
        ['low','normal','elevated','high','critical'].includes(s.level) ? s.level : 'low',
        ['rising','stable','falling'].includes(s.trend) ? s.trend : 'stable',
        Number.isFinite(s.change24h) ? s.change24h : 0,
        Number.isFinite(s.components?.unrest) ? Math.round(s.components.unrest) : 0,
        Number.isFinite(s.components?.conflict) ? Math.round(s.components.conflict) : 0,
        Number.isFinite(s.components?.security) ? Math.round(s.components.security) : 0,
        Number.isFinite(s.components?.information) ? Math.round(s.components.information) : 0,
        JSON.stringify({ components: s.components, change24h: s.change24h }),
      ]
    );
    if (r?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

/**
 * Job principal CII: pull articles → cluster → focal-point → ingest news →
 * calculateCII → persist.
 *
 * Devuelve { articlesScanned, clustersUsed, countriesScored, byLevel,
 *            inserted, updated, durationMs }.
 */
async function runCountryInstabilityJob({ lookbackHours = 24, limit = 1000 } = {}) {
  const t0 = Date.now();
  const articles = await fetchRecentArticles({ lookbackHours, limit });
  if (!articles.length) {
    return {
      articlesScanned: 0, clustersUsed: 0, countriesScored: 0,
      byLevel: { low: 0, normal: 0, elevated: 0, high: 0, critical: 0 },
      inserted: 0, updated: 0, durationMs: Date.now() - t0,
    };
  }

  const { clusterNews } = loadClustering();
  const clusters = clusterNews(articles);

  // Refresh focal-point singleton state so getCountryUrgencyMap() is current.
  // Pass the live SignalSummary (from signal-aggregator) if available so
  // urgencies elevated/critical propagate correctly to the focal map.
  const { focalPointDetector } = loadFocalPoint();
  const signalSummary = getCurrentSignalSummary();
  focalPointDetector.analyze(clusters || [], signalSummary);

  const cii = loadCII();
  // Bypass learning mode (15min warmup is for fresh cold-start UIs, not crons)
  cii.setHasCachedScores(true);
  cii.clearCountryData();
  cii.ingestNewsForCII(clusters || []);

  // Phase 2 step 8: pull recent military flights from DB and the live
  // tracked vessels from the AISstream subscriber, feed them to CII so
  // the security component reflects real military activity instead of 0.
  try {
    const flights = await getRecentMilitaryFlights({ lookbackMinutes: 10 });
    const milVessels = loadMilitaryVesselsTs().getTrackedMilitaryVessels();
    if (flights.length > 0 || milVessels.length > 0) {
      cii.ingestMilitaryForCII(flights, milVessels);
    }
  } catch (err) {
    console.warn('⚠️  CII military ingest failed (non-fatal):', err.message);
  }

  const scores = cii.calculateCII();

  const byLevel = { low: 0, normal: 0, elevated: 0, high: 0, critical: 0 };
  for (const s of scores) {
    if (byLevel[s.level] !== undefined) byLevel[s.level]++;
  }

  const persistResult = await persistCountryScores(scores);

  return {
    articlesScanned: articles.length,
    clustersUsed: clusters?.length || 0,
    countriesScored: scores.length,
    byLevel,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 4: trending-keywords
//
//  Pipeline:
//    rss_articles (24h) → TrendingHeadlineInput[] → ingestHeadlines()
//      → drainTrendingSignals() → wm_trending_keywords
//
//  Servicio fundamentalmente STREAMING: mantiene termFrequency Map en
//  memoria, baselines 7d, rolling window 2h, spike cooldown 30min.
//  Reusable en modelo cron porque:
//    - seenHeadlines Map deduplica re-ingestiones de los mismos artículos
//    - baselines se acumulan a lo largo de horas/días reales del proceso
//    - cooldown evita re-emitir el mismo spike < 30min
//
//  Trade-off aceptado: estado in-memory se pierde si engine reinicia.
//  Después del restart, primeras horas son cold-start (count >= 5
//  threshold sin baseline). En 7 días tendremos baselines reales.
//
//  Limitaciones por dependencias upstream Phase 1:
//    - mlWorker.isAvailable=false → spaCy NER no disponible → fallback a
//      heurístico proper-noun. Algunos términos genéricos no-inglés se
//      cuelan ('par', 'real', 'your'). Se arregla cuando se cablee
//      ml-worker en una fase posterior.
//    - i18n.t() es stub → title del signal viene como literal
//      "alerts.trending". Lo sustituimos a mano antes de persistir.
//    - summarization stub → autoSummarize desactivado en loadTrending()
//      para evitar log spam. Las descripciones quedan como el fallback
//      estático del propio handleSpike.
// ════════════════════════════════════════════════════════════

/**
 * Persiste trending signals como filas en wm_trending_keywords.
 * Idempotente vía term (UNIQUE): mismo término en runs sucesivos hace
 * UPDATE de count/baseline/multiplier/sources/headlines y bumpea last_seen.
 *
 * Acepta CorrelationSignal[] tal como lo devuelve drainTrendingSignals,
 * extrae spike data del campo .data.
 */
async function persistTrendingSignals(signals) {
  let inserted = 0, updated = 0;
  for (const sig of signals) {
    const data = sig.data || {};
    const term = String(data.term || '').trim();
    if (!term) continue;

    const r = await db.queryOne(
      `INSERT INTO wm_trending_keywords
         (term, mention_count, baseline, multiplier, unique_sources,
          window_hours, confidence, sample_headlines,
          signal_type, raw, first_seen, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
       ON CONFLICT (term) DO UPDATE SET
         mention_count    = EXCLUDED.mention_count,
         baseline         = EXCLUDED.baseline,
         multiplier       = EXCLUDED.multiplier,
         unique_sources   = EXCLUDED.unique_sources,
         window_hours     = EXCLUDED.window_hours,
         confidence       = EXCLUDED.confidence,
         sample_headlines = EXCLUDED.sample_headlines,
         signal_type      = EXCLUDED.signal_type,
         raw              = EXCLUDED.raw,
         last_seen        = NOW(),
         updated_at       = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        term.slice(0, 200),
        Number.isFinite(data.newsVelocity) ? data.newsVelocity : 0,
        Number.isFinite(data.baseline) ? data.baseline : 0,
        Number.isFinite(data.multiplier) ? data.multiplier : 0,
        Number.isFinite(data.sourceCount) ? data.sourceCount : 0,
        2,  // ROLLING_WINDOW_MS = 2h, hardcoded en trending-keywords.ts
        Number.isFinite(sig.confidence) ? sig.confidence : 0,
        JSON.stringify((data.relatedTopics || []).slice(0, 6)),
        String(sig.type || 'keyword_spike').slice(0, 50),
        JSON.stringify({
          id: sig.id,
          explanation: data.explanation,
          confidence: sig.confidence,
        }),
      ]
    );
    if (r?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

/**
 * Job principal trending: pull articles → reshape → ingest → drain → persist.
 *
 * Devuelve { articlesScanned, trackedTerms, signalsEmitted, inserted,
 *            updated, durationMs }.
 *
 * Importante: NO clearea estado entre runs. termFrequency Map debe
 * acumular para que las baselines 7d se vayan formando. La deduplication
 * via seenHeadlines previene doble conteo.
 */
async function runTrendingKeywordsJob({ lookbackHours = 24, limit = 1000 } = {}) {
  const t0 = Date.now();
  const articles = await fetchRecentArticles({ lookbackHours, limit });
  if (!articles.length) {
    return {
      articlesScanned: 0, trackedTerms: 0, signalsEmitted: 0,
      inserted: 0, updated: 0, durationMs: Date.now() - t0,
    };
  }

  const trending = loadTrending();

  // Reshape NewsItem → TrendingHeadlineInput
  const headlines = articles.map(a => ({
    title: a.title,
    pubDate: a.pubDate,
    source: a.source,
    link: a.link,
  }));

  trending.ingestHeadlines(headlines);

  // handleSpike() es async fire-and-forget dentro de ingestHeadlines.
  // Dale una ventana corta para que las significant-term checks resuelvan
  // (sin mlWorker el path es sincrónico/heurístico, ~ms). 300ms es
  // generoso pero seguro vs runs largos.
  await new Promise(resolve => setTimeout(resolve, 300));

  const signals = trending.drainTrendingSignals();
  const persistResult = await persistTrendingSignals(signals);

  return {
    articlesScanned: articles.length,
    trackedTerms: trending.getTrackedTermCount(),
    signalsEmitted: signals.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 5: military flights tracking via OpenSky direct OAuth2
//
//  Pipeline:
//    fetchMilitaryFlights() → 4 hotspot bbox queries with OAuth2 Bearer
//      → parseOpenSkyResponse → isMilitaryFlight filter
//      → persist as one row per (icao24, observed_at) snapshot
//
//  Why we persist HISTORICAL snapshots (not upsert by icao24):
//    User decision 2026-04-08 "lo más completo posible". Each cron run
//    is a fresh point-in-time snapshot of every detected military flight.
//    Allows trail/track reconstruction, time-of-day analysis, persistent
//    presence detection per region. Wm_military_flights grows ~216K
//    rows/day at 5min cadence with ~750 aircraft/run.
//
//  Retention:
//    The job calls cleanupOldFlights() at the end of each run to drop
//    rows older than RETENTION_DAYS (default 30). Bounded growth around
//    ~6.5M rows max. Adjustable via env MILITARY_FLIGHTS_RETENTION_DAYS.
// ════════════════════════════════════════════════════════════

const MILITARY_FLIGHTS_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.MILITARY_FLIGHTS_RETENTION_DAYS || '30', 10) || 30
);

/**
 * Persist a snapshot of MilitaryFlight[] as new rows in wm_military_flights.
 * Each row is a unique (icao24, observed_at) point. ON CONFLICT DO NOTHING
 * because the unique constraint prevents accidental duplicate inserts when
 * a flight is matched by multiple overlapping bbox queries (the upstream
 * `fetchFromOpenSky` already de-dupes by hexCode but we keep the safety).
 */
async function persistMilitaryFlights(flights, observedAt) {
  let inserted = 0;
  for (const f of flights) {
    // Extract hotspot from note ("Near INDO-PACIFIC" → "INDO-PACIFIC")
    let hotspot = null;
    if (typeof f.note === 'string' && f.note.startsWith('Near ')) {
      hotspot = f.note.slice(5);
    }

    const r = await db.queryOne(
      `INSERT INTO wm_military_flights
         (icao24, callsign, aircraft_type, aircraft_model,
          operator, operator_country,
          lat, lon, altitude_ft, heading_deg, speed_kt,
          vertical_rate_fpm, on_ground, squawk,
          confidence, is_interesting, hotspot, note,
          enriched, raw, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (icao24, observed_at) DO NOTHING
       RETURNING id`,
      [
        String(f.hexCode || '').toLowerCase().slice(0, 10),
        String(f.callsign || '').slice(0, 30) || null,
        String(f.aircraftType || 'unknown').slice(0, 30),
        f.aircraftModel ? String(f.aircraftModel).slice(0, 50) : null,
        String(f.operator || 'other').slice(0, 20),
        String(f.operatorCountry || 'Unknown').slice(0, 60),
        Number(f.lat),
        Number(f.lon),
        Number.isFinite(f.altitude) ? Math.round(f.altitude) : null,
        Number.isFinite(f.heading) ? f.heading : null,
        Number.isFinite(f.speed) ? Math.round(f.speed) : null,
        Number.isFinite(f.verticalRate) ? Math.round(f.verticalRate) : null,
        Boolean(f.onGround),
        f.squawk ? String(f.squawk).slice(0, 10) : null,
        ['high','medium','low'].includes(f.confidence) ? f.confidence : 'low',
        Boolean(f.isInteresting),
        hotspot,
        f.note ? String(f.note).slice(0, 200) : null,
        f.enriched ? JSON.stringify(f.enriched) : null,
        JSON.stringify({
          id: f.id,
          registration: f.registration,
          origin: f.origin,
          destination: f.destination,
        }),
        observedAt,
      ]
    );
    if (r?.id) inserted++;
  }
  return { inserted };
}

/**
 * Drop wm_military_flights rows older than the retention window.
 * Returns number of rows deleted.
 */
async function cleanupOldFlights(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (
       DELETE FROM wm_military_flights
       WHERE observed_at < NOW() - ($1::int * INTERVAL '1 day')
       RETURNING id
     )
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

/**
 * Job principal military flights: fetch via OpenSky OAuth2 → persist snapshot
 *  → cleanup old rows.
 *
 * Devuelve { flightsFetched, clustersFound, inserted, deleted, byOperator,
 *            byHotspot, durationMs }.
 */
async function runMilitaryFlightsJob() {
  const t0 = Date.now();
  const observedAt = new Date();

  const mil = loadMilitaryFlights();
  const result = await mil.fetchMilitaryFlights();
  const flights = result?.flights || [];
  const clusters = result?.clusters || [];

  const persistResult = await persistMilitaryFlights(flights, observedAt);
  const deleted = await cleanupOldFlights(MILITARY_FLIGHTS_RETENTION_DAYS);

  // Quick aggregate stats for the cron logger
  const byOperator = {};
  const byHotspot = {};
  for (const f of flights) {
    const op = f.operator || 'other';
    byOperator[op] = (byOperator[op] || 0) + 1;
    if (typeof f.note === 'string' && f.note.startsWith('Near ')) {
      const h = f.note.slice(5);
      byHotspot[h] = (byHotspot[h] || 0) + 1;
    }
  }

  return {
    flightsFetched: flights.length,
    clustersFound: clusters.length,
    inserted: persistResult.inserted,
    deleted,
    byOperator,
    byHotspot,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 6: USNI Fleet Tracker (HTML scraping via puppeteer)
//
//  Pipeline:
//    usni_scraper.scrapeLatestFleetReport()
//      → battle force totals + regions + vessels (~30-50 per report)
//      → upsert into wm_usni_fleet by article_url
//
//  Why HTML scraping instead of the WM gRPC client:
//    The WM-original usni-fleet.ts uses MilitaryServiceClient which is a
//    Phase 1 stub without backend. Scraping the public USNI page directly
//    is the only viable path until that gRPC service is implemented.
//
//  Cadence: weekly USNI publishes, but we run daily as a safety net so
//  the latest report is in DB within 24h of publication. Idempotent —
//  same article URL = UPDATE not INSERT.
// ════════════════════════════════════════════════════════════

async function persistUSNIReport(report) {
  const bf = report.battleForce || {};
  const r = await db.queryOne(
    `INSERT INTO wm_usni_fleet
       (article_url, article_title, article_date,
        total_battle_force, total_uss, total_usns,
        deployed, deployed_uss, deployed_usns, fdnf, rotational,
        underway, underway_deployed, underway_local,
        vessel_count, region_count,
        vessels, regions, raw_battle_force, parsed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
     ON CONFLICT (article_url) DO UPDATE SET
       article_title       = EXCLUDED.article_title,
       article_date        = EXCLUDED.article_date,
       total_battle_force  = EXCLUDED.total_battle_force,
       total_uss           = EXCLUDED.total_uss,
       total_usns          = EXCLUDED.total_usns,
       deployed            = EXCLUDED.deployed,
       deployed_uss        = EXCLUDED.deployed_uss,
       deployed_usns       = EXCLUDED.deployed_usns,
       fdnf                = EXCLUDED.fdnf,
       rotational          = EXCLUDED.rotational,
       underway            = EXCLUDED.underway,
       underway_deployed   = EXCLUDED.underway_deployed,
       underway_local      = EXCLUDED.underway_local,
       vessel_count        = EXCLUDED.vessel_count,
       region_count        = EXCLUDED.region_count,
       vessels             = EXCLUDED.vessels,
       regions             = EXCLUDED.regions,
       raw_battle_force    = EXCLUDED.raw_battle_force,
       parsed_at           = NOW(),
       last_seen           = NOW(),
       updated_at          = NOW()
     RETURNING (xmax = 0) AS inserted`,
    [
      String(report.articleUrl).slice(0, 500),
      String(report.articleTitle || 'Unknown').slice(0, 300),
      report.articleDate || null,
      bf.totalBattleForce, bf.totalUss, bf.totalUsns,
      bf.deployed, bf.deployedUss, bf.deployedUsns, bf.fdnf, bf.rotational,
      bf.underway, bf.underwayDeployed, bf.underwayLocal,
      report.vessels?.length || 0,
      report.regions?.length || 0,
      JSON.stringify(report.vessels || []),
      JSON.stringify(report.regions || []),
      JSON.stringify(bf),
    ]
  );
  return { inserted: r?.inserted ? 1 : 0, updated: r?.inserted ? 0 : 1 };
}

/**
 * Job principal USNI: scrape latest weekly report → persist (idempotent
 * by article_url). Returns stats for the cron logger.
 */
async function runUSNIFleetJob() {
  const t0 = Date.now();
  const usni = loadUsni();

  const report = await usni.scrapeLatestFleetReport();
  const persistResult = await persistUSNIReport(report);

  return {
    articleUrl: report.articleUrl,
    articleDate: report.articleDate,
    vesselCount: report.vessels?.length || 0,
    regionCount: report.regions?.length || 0,
    totalBattleForce: report.battleForce?.totalBattleForce,
    deployed: report.battleForce?.deployed,
    underway: report.battleForce?.underway,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 7: military vessels via AISstream WebSocket subscriber
//
//  Pipeline:
//    aisstream_subscriber.js   ← started at engine boot in server.js
//      WebSocket → processAisPosition() per message → trackedVessels Map
//      [persistent in-memory state in worldmonitor/services/military-vessels.ts]
//    runMilitaryVesselsJob (cron */5 min)
//      → getTrackedMilitaryVessels() snapshot
//      → INSERT into wm_military_vessels (mmsi, observed_at) UNIQUE
//      → cleanup of rows older than MILITARY_VESSELS_RETENTION_DAYS
//
//  Same historical-snapshot pattern as wm_military_flights.
//  Storage budget: ~10-100 tracked vessels × 12 cron runs/h × 24h ≈
//  3K-30K rows/day. With retention 30d → ~100K-1M rows max.
// ════════════════════════════════════════════════════════════

const MILITARY_VESSELS_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.MILITARY_VESSELS_RETENTION_DAYS || '30', 10) || 30
);

let militaryVesselsMod = null;
function loadMilitaryVesselsTs() {
  if (!militaryVesselsMod) {
    militaryVesselsMod = require('./worldmonitor/services/military-vessels');
  }
  return militaryVesselsMod;
}

async function persistMilitaryVessels(vessels, observedAt) {
  let inserted = 0;
  for (const v of vessels) {
    const r = await db.queryOne(
      `INSERT INTO wm_military_vessels
         (mmsi, vessel_name, vessel_type, operator, operator_country,
          hull_number, lat, lon, heading_deg, speed_kt, course_deg,
          ais_ship_type, ais_ship_type_name,
          is_dark, ais_gap_minutes,
          near_chokepoint, near_base, near_hotspot,
          confidence, raw, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (mmsi, observed_at) DO NOTHING
       RETURNING id`,
      [
        String(v.mmsi || '').slice(0, 20),
        v.name ? String(v.name).slice(0, 100) : null,
        v.vesselType || null,
        v.operator || 'other',
        v.operatorCountry || 'Unknown',
        v.hullNumber || null,
        Number(v.lat),
        Number(v.lon),
        Number.isFinite(v.heading) ? v.heading : null,
        Number.isFinite(v.speed) ? v.speed : null,
        Number.isFinite(v.course) ? v.course : null,
        Number.isFinite(v.aisShipType) ? v.aisShipType : null,
        v.aisShipTypeName || null,
        Boolean(v.isDark),
        Number.isFinite(v.aisGapMinutes) ? Math.round(v.aisGapMinutes) : null,
        v.nearChokepoint || null,
        v.nearBase || null,
        v.nearHotspot || null,
        ['high','medium','low'].includes(v.confidence) ? v.confidence : 'low',
        JSON.stringify({
          id: v.id,
          firstSeen: v.firstSeen,
          lastSeen: v.lastSeen,
        }),
        observedAt,
      ]
    );
    if (r?.id) inserted++;
  }
  return { inserted };
}

async function cleanupOldVessels(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (
       DELETE FROM wm_military_vessels
       WHERE observed_at < NOW() - ($1::int * INTERVAL '1 day')
       RETURNING id
     )
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

/**
 * Job principal military vessels: snapshot in-memory tracked vessels →
 * persist → cleanup. Devuelve { tracked, inserted, deleted, byOperator,
 * byChokepoint, durationMs }.
 */
async function runMilitaryVesselsJob() {
  const t0 = Date.now();
  const observedAt = new Date();

  const mil = loadMilitaryVesselsTs();
  const vessels = mil.getTrackedMilitaryVessels();

  const persistResult = await persistMilitaryVessels(vessels, observedAt);
  const deleted = await cleanupOldVessels(MILITARY_VESSELS_RETENTION_DAYS);

  const byOperator = {};
  const byChokepoint = {};
  for (const v of vessels) {
    const op = v.operator || 'other';
    byOperator[op] = (byOperator[op] || 0) + 1;
    if (v.nearChokepoint) {
      byChokepoint[v.nearChokepoint] = (byChokepoint[v.nearChokepoint] || 0) + 1;
    }
  }

  return {
    tracked: vessels.length,
    inserted: persistResult.inserted,
    deleted,
    byOperator,
    byChokepoint,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 8: signal-aggregator (cross-feed correlation)
//
//  The signal-aggregator is a singleton in-memory aggregator that takes
//  raw signal feeds (military flights, naval vessels, internet outages,
//  protests, AIS disruptions, satellite fires, temporal anomalies) and
//  produces a SignalSummary with country clusters + regional convergence
//  + AI context. That SignalSummary is then consumed by:
//
//   - focal-point-detector → activates urgencies elevated/critical
//   - country-instability  → security component becomes real
//
//  Pipeline:
//    1. getRecentMilitaryFlights({lookback 10min}) ← from wm_military_flights
//    2. getTrackedMilitaryVessels() ← in-memory from aisstream subscriber
//    3. signalAggregator.ingestFlights(flights)
//    4. signalAggregator.ingestVessels(vessels)
//    5. signalAggregator.getSummary() → SignalSummary
//    6. persist snapshot to wm_signal_summary
//    7. cleanup rows > retention days
//
//  Other ingest methods (Outages, Protests, AisDisruptions, etc.) will
//  be added when the corresponding feeds are wired in future steps.
//  Each call clears its own signal type before pushing, so calling only
//  ingestFlights+ingestVessels is safe — the others stay empty.
//
//  Cron cadence: every 5 min, offset +1 min from the flights/vessels
//  jobs so they always run AFTER the data sources (`1-59/5 * * * *`).
// ════════════════════════════════════════════════════════════

const SIGNAL_SUMMARY_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.SIGNAL_SUMMARY_RETENTION_DAYS || '30', 10) || 30
);

async function persistSignalSummary(summary, flightsIngested, vesselsIngested, observedAt) {
  const r = await db.queryOne(
    `INSERT INTO wm_signal_summary
       (total_signals, by_type, top_countries, convergence_zones,
        ai_context, flights_ingested, vessels_ingested, observed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      Number.isFinite(summary.totalSignals) ? summary.totalSignals : 0,
      JSON.stringify(summary.byType || {}),
      // topCountries contains a Set in signalTypes — JSON.stringify drops
      // Sets silently. Convert to array first so the shape persists.
      JSON.stringify((summary.topCountries || []).map(c => ({
        country: c.country,
        countryName: c.countryName,
        totalCount: c.totalCount,
        highSeverityCount: c.highSeverityCount,
        convergenceScore: c.convergenceScore,
        signalTypes: Array.from(c.signalTypes || []),
      }))),
      JSON.stringify(summary.convergenceZones || []),
      String(summary.aiContext || '').slice(0, 4000),
      flightsIngested,
      vesselsIngested,
      observedAt,
    ]
  );
  return { inserted: r?.id ? 1 : 0 };
}

async function cleanupOldSignalSummaries(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (
       DELETE FROM wm_signal_summary
       WHERE observed_at < NOW() - ($1::int * INTERVAL '1 day')
       RETURNING id
     )
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

/**
 * Job principal signal-aggregator: pull flights from BD + vessels from
 * memory → ingest into singleton → snapshot SignalSummary → persist.
 */
async function runSignalAggregatorJob() {
  const t0 = Date.now();
  const observedAt = new Date();

  // 1. Pull data from upstream sources
  const flights = await getRecentMilitaryFlights({ lookbackMinutes: 10 });
  const vessels = loadMilitaryVesselsTs().getTrackedMilitaryVessels();

  // 2. Ingest into the singleton aggregator. Each ingest clears its own
  //    signal type first, so this acts like "replace flights signals,
  //    replace vessel signals" — clean idempotent state per cron.
  const sa = loadSignalAggregator();
  sa.signalAggregator.ingestFlights(flights);
  sa.signalAggregator.ingestVessels(vessels);

  // 3. Snapshot the resulting SignalSummary
  const summary = sa.signalAggregator.getSummary();

  // 4. Persist + cleanup
  const persistResult = await persistSignalSummary(
    summary, flights.length, vessels.length, observedAt
  );
  const deleted = await cleanupOldSignalSummaries(SIGNAL_SUMMARY_RETENTION_DAYS);

  return {
    flights: flights.length,
    vessels: vessels.length,
    totalSignals: summary.totalSignals,
    byType: summary.byType,
    topCountriesCount: (summary.topCountries || []).length,
    convergenceZonesCount: (summary.convergenceZones || []).length,
    inserted: persistResult.inserted,
    deleted,
    durationMs: Date.now() - t0,
  };
}

module.exports = {
  runClusteringJob,
  runFocalPointJob,
  runCountryInstabilityJob,
  runTrendingKeywordsJob,
  runMilitaryFlightsJob,
  runUSNIFleetJob,
  runMilitaryVesselsJob,
  runSignalAggregatorJob,
  fetchRecentArticles,         // exported for testing
  persistClusters,             // exported for testing
  persistFocalPoints,          // exported for testing
  persistCountryScores,        // exported for testing
  persistTrendingSignals,      // exported for testing
  persistMilitaryFlights,      // exported for testing
  cleanupOldFlights,           // exported for testing
  persistUSNIReport,           // exported for testing
  persistMilitaryVessels,      // exported for testing
  cleanupOldVessels,           // exported for testing
  persistSignalSummary,        // exported for testing
  cleanupOldSignalSummaries,   // exported for testing
  getRecentMilitaryFlights,    // exported for testing
  getCurrentSignalSummary,     // exported for testing
};
