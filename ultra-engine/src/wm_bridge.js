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
//   8. runSignalAggregatorJob    — flights+vessels+fires+quakes → signal-aggregator.ts → wm_signal_summary
//   9. runNaturalEventsJob       — eonet.ts (NASA EONET + GDACS) → wm_natural_events
//  10. runEarthquakesJob         — earthquakes.ts (USGS GeoJSON direct) → wm_earthquakes
//  11. runSatelliteFiresJob      — wildfires/index.ts (NASA FIRMS direct) → wm_satellite_fires
//  12. runWmGdeltIntelJob        — wm_gdelt_intel.js (24 topics, retry/stagger) → wm_intel_articles
//  --- Phase 3 (commodities/market verticals, Bloque 1) ---
//  14. runMarketQuotesJob        — Yahoo v8 chart direct → wm_market_quotes
//  15. runCryptoQuotesJob        — CoinGecko public API → wm_crypto_quotes
//  --- Phase 3 (commodities/market verticals, Bloque 2) ---
//  16. runEnergyInventoriesJob   — EIA v2 seriesid (4 weekly series) → wm_energy_inventories
//  17. runFxRatesJob             — Frankfurter ECB ref rates → wm_fx_rates
//  --- Phase 3 (commodities/market verticals, Bloque 3) ---
//  18. runMacroIndicatorsJob     — FRED (12 series) + World Bank (2 series) → wm_macro_indicators
//  19. runAgriCommoditiesJob     — USDA NASS Quick Stats (5 crops) → wm_agri_commodities
//  --- Phase 3 (prediction markets, Bloque 4) ---
//  20. runManifoldMarketsJob     — Manifold /v0/search-markets → wm_prediction_markets
//      runKalshiMarketsJob       — Kalshi /v2/events → wm_prediction_markets
//      runPolymarketMarketsJob   — Polymarket Gamma /events → wm_prediction_markets
//  --- Phase 3 (cyber + infra + commercial transport + correlation, Bloque 5) ---
//  21. runCyberCvesJob              — NIST NVD 2.0 + CISA KEV → wm_cyber_cves
//  22. runCloudflareRadarOutagesJob — Cloudflare Radar /annotations/outages → wm_internet_outages
//  23. runCommercialFlightsJob      — OpenSky /api/states/all (non-mil) → wm_commercial_flights
//  24. runCommercialVesselsJob      — AISStream fan-out (cargo/tanker) → wm_commercial_vessels
//  25. runCorrelationJob            — Phase 2 closure: PG-driven detectors → wm_correlation_signals
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

let eonetMod = null;
function loadEonet() {
  if (!eonetMod) {
    eonetMod = require('./worldmonitor/services/eonet');
  }
  return eonetMod;
}

let earthquakesMod = null;
function loadEarthquakes() {
  if (!earthquakesMod) {
    earthquakesMod = require('./worldmonitor/services/earthquakes');
  }
  return earthquakesMod;
}

let wildfiresMod = null;
function loadWildfires() {
  if (!wildfiresMod) {
    wildfiresMod = require('./worldmonitor/services/wildfires');
  }
  return wildfiresMod;
}

let marketQuotesMod = null;
function loadMarketQuotes() {
  if (!marketQuotesMod) {
    marketQuotesMod = require('./worldmonitor/services/market-quotes');
  }
  return marketQuotesMod;
}

let cryptoQuotesMod = null;
function loadCryptoQuotes() {
  if (!cryptoQuotesMod) {
    cryptoQuotesMod = require('./worldmonitor/services/crypto-quotes');
  }
  return cryptoQuotesMod;
}

let energyInventoriesMod = null;
function loadEnergyInventories() {
  if (!energyInventoriesMod) {
    energyInventoriesMod = require('./worldmonitor/services/energy-inventories');
  }
  return energyInventoriesMod;
}

let fxRatesMod = null;
function loadFxRates() {
  if (!fxRatesMod) {
    fxRatesMod = require('./worldmonitor/services/fx-rates');
  }
  return fxRatesMod;
}

let macroIndicatorsMod = null;
function loadMacroIndicators() {
  if (!macroIndicatorsMod) {
    macroIndicatorsMod = require('./worldmonitor/services/macro-indicators');
  }
  return macroIndicatorsMod;
}

let agriCommoditiesMod = null;
function loadAgriCommodities() {
  if (!agriCommoditiesMod) {
    agriCommoditiesMod = require('./worldmonitor/services/agri-commodities');
  }
  return agriCommoditiesMod;
}

let manifoldMarketsMod = null;
function loadManifoldMarkets() {
  if (!manifoldMarketsMod) {
    manifoldMarketsMod = require('./worldmonitor/services/manifold-markets');
  }
  return manifoldMarketsMod;
}

let kalshiMarketsMod = null;
function loadKalshiMarkets() {
  if (!kalshiMarketsMod) {
    kalshiMarketsMod = require('./worldmonitor/services/kalshi-markets');
  }
  return kalshiMarketsMod;
}

let polymarketMarketsMod = null;
function loadPolymarketMarkets() {
  if (!polymarketMarketsMod) {
    polymarketMarketsMod = require('./worldmonitor/services/polymarket-markets');
  }
  return polymarketMarketsMod;
}

// ─── WM Phase 3 Bloque 5 lazy module loaders ──────────────────────
let cyberCvesMod = null;
function loadCyberCves() {
  if (!cyberCvesMod) {
    cyberCvesMod = require('./worldmonitor/services/cyber-cves');
  }
  return cyberCvesMod;
}

let cfRadarOutagesMod = null;
function loadCloudflareRadarOutages() {
  if (!cfRadarOutagesMod) {
    cfRadarOutagesMod = require('./worldmonitor/services/cloudflare-radar-outages');
  }
  return cfRadarOutagesMod;
}

let commercialFlightsMod = null;
function loadCommercialFlights() {
  if (!commercialFlightsMod) {
    commercialFlightsMod = require('./worldmonitor/services/commercial-flights');
  }
  return commercialFlightsMod;
}

let commercialVesselsMod = null;
function loadCommercialVessels() {
  if (!commercialVesselsMod) {
    commercialVesselsMod = require('./worldmonitor/services/commercial-vessels');
  }
  return commercialVesselsMod;
}

let correlationRunnerMod = null;
function loadCorrelationRunner() {
  if (!correlationRunnerMod) {
    correlationRunnerMod = require('./worldmonitor/services/correlation-runner');
  }
  return correlationRunnerMod;
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
 * Job principal signal-aggregator: pull flights/vessels/fires/quakes
 * from BD/memory → ingest into singleton → snapshot SignalSummary →
 * persist.
 *
 * Each `ingest*` call clears its own signal type before pushing, so this
 * acts as "replace per type" — fully idempotent across cron runs.
 */
async function runSignalAggregatorJob() {
  const t0 = Date.now();
  const observedAt = new Date();

  // 1. Pull data from upstream sources
  const flights = await getRecentMilitaryFlights({ lookbackMinutes: 10 });
  const vessels = loadMilitaryVesselsTs().getTrackedMilitaryVessels();
  const fires = await getRecentSatelliteFires({ lookbackHours: 24, minBrightness: 340 });
  const quakeAnomalies = await getRecentEarthquakeAnomalies({ lookbackHours: 24, minQuakes: 3 });

  // 2. Ingest into the singleton aggregator. Each ingest clears its own
  //    signal type first, so this acts like "replace flights signals,
  //    replace vessel signals" — clean idempotent state per cron.
  const sa = loadSignalAggregator();
  sa.signalAggregator.ingestFlights(flights);
  sa.signalAggregator.ingestVessels(vessels);
  if (fires.length > 0) sa.signalAggregator.ingestSatelliteFires(fires);
  if (quakeAnomalies.length > 0) sa.signalAggregator.ingestTemporalAnomalies(quakeAnomalies);

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
    fires: fires.length,
    quakeAnomalies: quakeAnomalies.length,
    totalSignals: summary.totalSignals,
    byType: summary.byType,
    topCountriesCount: (summary.topCountries || []).length,
    convergenceZonesCount: (summary.convergenceZones || []).length,
    inserted: persistResult.inserted,
    deleted,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 2 — Jobs 9-11: natural disasters (EONET, GDACS, USGS, FIRMS)
//
//  Three independent producers:
//
//   - runNaturalEventsJob   → fetchNaturalEvents() (EONET + GDACS merged)
//                              → wm_natural_events (upsert by source+event_id)
//
//   - runEarthquakesJob     → fetchEarthquakesFromUsgs() (USGS GeoJSON)
//                              → wm_earthquakes (upsert by usgs_id)
//
//   - runSatelliteFiresJob  → fetchSatelliteFiresFromFirms() (NASA FIRMS CSV)
//                              → wm_satellite_fires (insert ON CONFLICT DO NOTHING
//                                via composite UNIQUE)
//
//  All three are consumed by runSignalAggregatorJob via two helpers:
//   - getRecentEarthquakes  → derives temporal_anomaly signals (quake spikes
//                              per country) and feeds ingestTemporalAnomalies()
//   - getRecentSatelliteFires → feeds ingestSatelliteFires() directly
// ════════════════════════════════════════════════════════════

const NATURAL_EVENTS_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.NATURAL_EVENTS_RETENTION_DAYS || '30', 10) || 30
);
const EARTHQUAKES_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.EARTHQUAKES_RETENTION_DAYS || '30', 10) || 30
);
const SATELLITE_FIRES_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.SATELLITE_FIRES_RETENTION_DAYS || '14', 10) || 14
);
const WM_INTEL_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.WM_INTEL_RETENTION_DAYS || '7', 10) || 7
);

// ─── Persisters ───────────────────────────────────────────

async function persistNaturalEvents(events) {
  let inserted = 0, updated = 0;
  for (const e of events) {
    // EONET event id is e.id (string like "EONET_19349")
    // GDACS converted event id is e.id (string like "gdacs-FL-1103757")
    const source = (e.sourceName === 'GDACS' || String(e.id).startsWith('gdacs-')) ? 'GDACS' : 'EONET';
    const r = await db.queryOne(
      `INSERT INTO wm_natural_events
         (source, event_id, category, title, description,
          lat, lon, event_date, magnitude, magnitude_unit,
          alert_level, country, source_url, source_name, closed, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (source, event_id) DO UPDATE SET
         category       = EXCLUDED.category,
         title          = EXCLUDED.title,
         description    = EXCLUDED.description,
         lat            = EXCLUDED.lat,
         lon            = EXCLUDED.lon,
         event_date     = EXCLUDED.event_date,
         magnitude      = EXCLUDED.magnitude,
         magnitude_unit = EXCLUDED.magnitude_unit,
         alert_level    = EXCLUDED.alert_level,
         country        = EXCLUDED.country,
         source_url     = EXCLUDED.source_url,
         closed         = EXCLUDED.closed,
         raw            = EXCLUDED.raw,
         last_seen      = NOW(),
         updated_at     = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        source,
        String(e.id).slice(0, 200),
        String(e.category || '').slice(0, 50) || null,
        String(e.title || 'Unknown').slice(0, 500),
        e.description ? String(e.description).slice(0, 2000) : null,
        Number.isFinite(e.lat) ? e.lat : null,
        Number.isFinite(e.lon) ? e.lon : null,
        e.date instanceof Date ? e.date : (e.date ? new Date(e.date) : null),
        Number.isFinite(e.magnitude) ? e.magnitude : null,
        e.magnitudeUnit ? String(e.magnitudeUnit).slice(0, 50) : null,
        // GDACS title starts with emoji marker for Red/Orange — extract
        (typeof e.title === 'string' && e.title.startsWith('🔴 ')) ? 'Red'
          : (typeof e.title === 'string' && e.title.startsWith('🟠 ')) ? 'Orange'
          : null,
        null,  // country (GDACS sets it but the merged shape strips it; could be improved)
        e.sourceUrl ? String(e.sourceUrl).slice(0, 1000) : null,
        e.sourceName ? String(e.sourceName).slice(0, 100) : null,
        Boolean(e.closed),
        JSON.stringify({ id: e.id, categoryTitle: e.categoryTitle }),
      ]
    );
    if (r?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

async function persistEarthquakes(quakes) {
  let inserted = 0, updated = 0;
  for (const q of quakes) {
    const r = await db.queryOne(
      `INSERT INTO wm_earthquakes
         (usgs_id, magnitude, place, event_time, depth_km,
          lat, lon, event_type, alert_level, tsunami,
          felt, cdi, mmi, significance, url, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (usgs_id) DO UPDATE SET
         magnitude    = EXCLUDED.magnitude,
         place        = EXCLUDED.place,
         depth_km     = EXCLUDED.depth_km,
         alert_level  = EXCLUDED.alert_level,
         tsunami      = EXCLUDED.tsunami,
         felt         = EXCLUDED.felt,
         cdi          = EXCLUDED.cdi,
         mmi          = EXCLUDED.mmi,
         significance = EXCLUDED.significance,
         raw          = EXCLUDED.raw,
         updated_at   = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        String(q.id).slice(0, 50),
        Number(q.magnitude),
        String(q.place || '').slice(0, 300),
        q.eventTime instanceof Date ? q.eventTime : new Date(q.eventTime),
        Number(q.depthKm) || 0,
        Number(q.lat),
        Number(q.lon),
        String(q.eventType || 'earthquake').slice(0, 30),
        q.alertLevel || null,
        Boolean(q.tsunami),
        Number.isFinite(q.felt) ? q.felt : null,
        Number.isFinite(q.cdi) ? q.cdi : null,
        Number.isFinite(q.mmi) ? q.mmi : null,
        Number.isFinite(q.significance) ? q.significance : null,
        q.url ? String(q.url).slice(0, 500) : null,
        JSON.stringify(q.raw || {}),
      ]
    );
    if (r?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

async function persistSatelliteFires(fires, observedAt) {
  let inserted = 0;
  for (const f of fires) {
    const r = await db.queryOne(
      `INSERT INTO wm_satellite_fires
         (lat, lon, bright_ti4, bright_ti5, scan, track,
          acq_date, acq_time, satellite, instrument, confidence,
          version, frp, daynight, region, raw, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (lat, lon, acq_date, acq_time, satellite) DO NOTHING
       RETURNING id`,
      [
        Number(f.lat),
        Number(f.lon),
        Number(f.brightTi4) || null,
        Number(f.brightTi5) || null,
        Number(f.scan) || null,
        Number(f.track) || null,
        f.acqDate,
        String(f.acqTime || '').slice(0, 6),
        String(f.satellite || '').slice(0, 5),
        f.instrument ? String(f.instrument).slice(0, 20) : null,
        f.confidence ? String(f.confidence).slice(0, 5) : null,
        f.version ? String(f.version).slice(0, 20) : null,
        Number(f.frp) || null,
        f.daynight ? String(f.daynight).slice(0, 2) : null,
        null,  // region — could be derived from lat/lon, left null for now
        null,  // raw — would explode storage if we keep full per-fire payload
        observedAt,
      ]
    );
    if (r?.id) inserted++;
  }
  return { inserted };
}

// ─── Cleanup helpers ──────────────────────────────────────

async function cleanupOldNaturalEvents(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_natural_events
                  WHERE last_seen < NOW() - ($1::int * INTERVAL '1 day')
                    AND closed = TRUE
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function cleanupOldEarthquakes(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_earthquakes
                  WHERE event_time < NOW() - ($1::int * INTERVAL '1 day')
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function cleanupOldSatelliteFires(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_satellite_fires
                  WHERE observed_at < NOW() - ($1::int * INTERVAL '1 day')
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

// ─── Recent-window readers (for signal-aggregator) ────────

/**
 * Pull recent earthquakes from BD and bucket them by country code via the
 * signal-aggregator's coordsToCountry() helper. Returns the temporal
 * anomaly shape that ingestTemporalAnomalies() expects:
 *   { type, region, currentCount, expectedCount, zScore, message, severity }
 *
 * Logic: any country with >=3 quakes M>=4.5 in the last 24h is flagged
 * as a "earthquake_spike" anomaly. Without a real baseline (would
 * require a temporal-baseline service backend), expectedCount=1 is the
 * heuristic prior; severity scales with currentCount.
 */
async function getRecentEarthquakeAnomalies({ lookbackHours = 24, minQuakes = 3 } = {}) {
  const rows = await db.queryAll(
    `SELECT lat, lon, magnitude, place, event_time
     FROM wm_earthquakes
     WHERE event_time >= NOW() - ($1::int * INTERVAL '1 hour')
       AND magnitude >= 4.5
     ORDER BY event_time DESC`,
    [lookbackHours]
  );

  // Bucket by country via the signal-aggregator's own helper logic.
  // We mirror the bbox logic from signal-aggregator.ts coordsToCountry()
  // here in JS to avoid pulling the singleton just for classification.
  const coordsToCountry = (lat, lon) => {
    if (lat >= 25 && lat <= 40 && lon >= 44 && lon <= 63) return 'IR';
    if (lat >= 29 && lat <= 33 && lon >= 34 && lon <= 36) return 'IL';
    if (lat >= 15 && lat <= 32 && lon >= 34 && lon <= 55) return 'SA';
    if (lat >= 20 && lat <= 55 && lon >= 73 && lon <= 135) return 'CN';
    if (lat >= 22 && lat <= 25 && lon >= 120 && lon <= 122) return 'TW';
    if (lat >= 8 && lat <= 37 && lon >= 68 && lon <= 97) return 'IN';
    if (lat >= 44 && lat <= 52 && lon >= 22 && lon <= 40) return 'UA';
    if (lat >= 50 && lat <= 82 && lon >= 20 && lon <= 180) return 'RU';
    if (lat >= 22 && lat <= 32 && lon >= 25 && lon <= 35) return 'EG';
    return 'XX';
  };

  const counts = new Map();
  for (const r of rows) {
    const c = coordsToCountry(Number(r.lat), Number(r.lon));
    if (c === 'XX') continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }

  const anomalies = [];
  for (const [country, n] of counts) {
    if (n < minQuakes) continue;
    anomalies.push({
      type: 'earthquake_spike',
      region: country,
      currentCount: n,
      expectedCount: 1,
      zScore: n,  // crude — without real baseline, count IS the score
      message: `${n} earthquakes M>=4.5 in last ${lookbackHours}h in ${country}`,
      severity: n >= 8 ? 'critical' : n >= 5 ? 'high' : 'medium',
    });
  }
  return anomalies;
}

/**
 * Pull recent satellite fires from BD and reshape to the format that
 * signalAggregator.ingestSatelliteFires() expects.
 *
 * The aggregator's ingest only uses brightness > 320 / 360 thresholds
 * for severity. We pre-filter to high-confidence + high-intensity to
 * keep noise low (NRT data has ~30% nominal-confidence false positives).
 *
 * CRITICAL: signal-aggregator runs `new Date(fire.acq_date)` then
 * pruneOld() which drops everything older than 24h. If we passed only
 * the date string (e.g. "2026-04-07"), JS parses it as midnight UTC of
 * that day — easily 36+ hours ago — and pruneOld() drops every fire.
 *
 * Fix: combine acq_date + acq_time (HHMM format from FIRMS) into a
 * proper Date instance and pass THAT as acq_date. signal-aggregator's
 * `new Date(...)` accepts both strings and Date instances; the latter
 * preserves the actual observation timestamp inside the 24h window.
 *
 * We also drop any fire whose computed timestamp is already > 24h old
 * before returning, so the aggregator never sees stale ingestions.
 */
async function getRecentSatelliteFires({ lookbackHours = 24, minBrightness = 340 } = {}) {
  // Cast acq_date to text in the SELECT to avoid pg-node converting it
  // through the container's local timezone (Pacific/Auckland, UTC+12).
  // Without the cast, a DATE column 2026-04-08 comes back as
  // 2026-04-07T12:00:00Z (NZ midnight in UTC), and `.toISOString().slice(0,10)`
  // would give the wrong day. Same TZ-shift bug we had with USNI dates.
  const rows = await db.queryAll(
    `SELECT lat, lon, bright_ti4, frp, region,
            to_char(acq_date, 'YYYY-MM-DD') AS acq_date_str,
            acq_time
     FROM wm_satellite_fires
     WHERE observed_at >= NOW() - ($1::int * INTERVAL '1 hour')
       AND bright_ti4 >= $2
       AND confidence IN ('h','n')
     ORDER BY bright_ti4 DESC
     LIMIT 5000`,
    [lookbackHours, minBrightness]
  );
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const out = [];
  for (const r of rows) {
    const dateStr = String(r.acq_date_str || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    // FIRMS acq_time is HHMM but with leading zero stripped:
    // "22" = 00:22, "219" = 02:19, "1958" = 19:58. padStart restores it.
    const timeStr = String(r.acq_time || '0000').padStart(4, '0');
    const hh = timeStr.slice(0, 2);
    const mm = timeStr.slice(2, 4);
    const ts = new Date(`${dateStr}T${hh}:${mm}:00Z`);
    if (!Number.isFinite(ts.getTime())) continue;
    if (ts.getTime() < cutoff) continue;
    out.push({
      lat: Number(r.lat),
      lon: Number(r.lon),
      brightness: Number(r.bright_ti4),
      frp: Number(r.frp) || 0,
      region: r.region || 'Unknown',
      // Pass a Date instance, not a string — survives `new Date(date)` and
      // keeps the real observation timestamp for the aggregator's pruneOld.
      acq_date: ts,
    });
  }
  return out;
}

// ─── Jobs ─────────────────────────────────────────────────

async function runNaturalEventsJob({ days = 30 } = {}) {
  const t0 = Date.now();
  const eonet = loadEonet();
  const events = await eonet.fetchNaturalEvents(days);
  const persistResult = await persistNaturalEvents(events);
  const deleted = await cleanupOldNaturalEvents(NATURAL_EVENTS_RETENTION_DAYS);
  return {
    fetched: events.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    deleted,
    durationMs: Date.now() - t0,
  };
}

async function runEarthquakesJob({ minMagnitude = '4.5', period = 'day' } = {}) {
  const t0 = Date.now();
  const eq = loadEarthquakes();
  const quakes = await eq.fetchEarthquakesFromUsgs({ minMagnitude, period });
  const persistResult = await persistEarthquakes(quakes);
  const deleted = await cleanupOldEarthquakes(EARTHQUAKES_RETENTION_DAYS);
  return {
    fetched: quakes.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    deleted,
    maxMag: quakes.reduce((m, q) => Math.max(m, q.magnitude || 0), 0),
    durationMs: Date.now() - t0,
  };
}

async function runSatelliteFiresJob({ source = 'VIIRS_SNPP_NRT', area = '-180,-90,180,90', dayRange = 1 } = {}) {
  const t0 = Date.now();
  const observedAt = new Date();
  const wf = loadWildfires();
  const fires = await wf.fetchSatelliteFiresFromFirms({ source, area, dayRange });
  const persistResult = await persistSatelliteFires(fires, observedAt);
  const deleted = await cleanupOldSatelliteFires(SATELLITE_FIRES_RETENTION_DAYS);
  return {
    fetched: fires.length,
    inserted: persistResult.inserted,
    deleted,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 12: wm-gdelt-intel
//
//  Reemplaza el cron legacy `gdelt-fetch` (news_apis.fetchGdelt) que
//  alternaba HTTP 429 / fetch failed / timeout. Itera 24 topic queries
//  con stagger + retry exponencial. Persiste en wm_intel_articles.
// ════════════════════════════════════════════════════════════

let wmGdeltIntelMod = null;
function loadWmGdeltIntel() {
  if (!wmGdeltIntelMod) {
    wmGdeltIntelMod = require('./wm_gdelt_intel');
  }
  return wmGdeltIntelMod;
}

async function persistIntelArticles(topicResults) {
  let inserted = 0;
  let updated = 0;
  for (const tr of topicResults) {
    if (!tr || !Array.isArray(tr.articles)) continue;
    const topic = tr.topic;
    for (const a of tr.articles) {
      const r = await db.queryOne(
        `INSERT INTO wm_intel_articles
           (topic_id, topic_name, topic_icon, title, url, source,
            seendate, language, tone, image, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (topic_id, url) DO UPDATE SET
           title = EXCLUDED.title,
           source = EXCLUDED.source,
           seendate = COALESCE(EXCLUDED.seendate, wm_intel_articles.seendate),
           language = COALESCE(EXCLUDED.language, wm_intel_articles.language),
           tone = COALESCE(EXCLUDED.tone, wm_intel_articles.tone),
           image = COALESCE(EXCLUDED.image, wm_intel_articles.image),
           fetched_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          String(topic.id).slice(0, 50),
          String(topic.name).slice(0, 200),
          topic.icon ? String(topic.icon).slice(0, 20) : null,
          String(a.title || '').slice(0, 1000),
          String(a.url || '').slice(0, 2000),
          a.source ? String(a.source).slice(0, 200) : null,
          a.seendate || null,
          a.language ? String(a.language).slice(0, 20) : null,
          a.tone != null ? Number(a.tone) : null,
          a.image ? String(a.image).slice(0, 1000) : null,
        ]
      );
      if (r?.inserted) inserted++;
      else updated++;
    }
  }
  return { inserted, updated };
}

async function cleanupOldIntelArticles(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_intel_articles
                  WHERE fetched_at < NOW() - ($1::int * INTERVAL '1 day')
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function runWmGdeltIntelJob({ group = 'a' } = {}) {
  const t0 = Date.now();
  const wmgi = loadWmGdeltIntel();
  const results = await wmgi.fetchGroup(group);

  const topicsTotal = results.length;
  const topicsOk = results.filter(r => !r.error && r.articles.length > 0).length;
  const topicsErr = results.filter(r => r.error).length;
  const topicsEmpty = results.filter(r => !r.error && r.articles.length === 0).length;
  const articlesTotal = results.reduce((s, r) => s + (r.articles?.length || 0), 0);

  const persistResult = await persistIntelArticles(results);
  // Cleanup runs only on group 'f' (last of the cycle) to avoid 6 deletes per hour
  const deleted = group === 'f' ? await cleanupOldIntelArticles(WM_INTEL_RETENTION_DAYS) : 0;

  // Capture per-topic errors compactly for log diagnostics
  const errSummary = results
    .filter(r => r.error)
    .map(r => `${r.topic.id}:${r.error.slice(0, 30)}`)
    .join(',');

  return {
    group,
    topicsTotal,
    topicsOk,
    topicsEmpty,
    topicsErr,
    articlesFetched: articlesTotal,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    deleted,
    errors: errSummary || null,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 2 — Job 13: wm-hotspot-escalation
//
//  Calcula score dinámico de escalación 1.0–5.0 para los 27
//  INTEL_HOTSPOTS combinando 4 componentes desde tablas WM ya
//  pobladas (cero llamadas externas):
//   - newsActivity (35%) — wm_clusters keyword matches en 6h
//   - ciiContribution (25%) — wm_country_scores max para países mapeados
//   - geoConvergence (25%) — wm_signal_summary convergence_zones cercanas
//   - militaryActivity (15%) — wm_military_flights+vessels en 200km
//
//  Persiste en wm_hotspot_escalation (PRIMARY KEY hotspot_id, UPSERT)
//  preservando prev_combined_score para derivar trend.
// ════════════════════════════════════════════════════════════

let wmHotspotEscMod = null;
function loadWmHotspotEsc() {
  if (!wmHotspotEscMod) {
    wmHotspotEscMod = require('./wm_hotspot_escalation');
  }
  return wmHotspotEscMod;
}

async function fetchNewsMatchesForHotspot(hotspot, windowHours) {
  // ILIKE OR over keywords. wm_clusters has no country field, so
  // keyword match against primary_title is our only signal.
  if (!hotspot.keywords || hotspot.keywords.length === 0) return 0;
  const ilikeClauses = hotspot.keywords
    .map((_, i) => `primary_title ILIKE $${i + 1}`)
    .join(' OR ');
  const params = hotspot.keywords.map(k => `%${k}%`);
  params.push(windowHours);
  const r = await db.queryOne(
    `SELECT COUNT(*)::int AS n
       FROM wm_clusters
      WHERE last_seen > NOW() - ($${params.length}::int * INTERVAL '1 hour')
        AND (${ilikeClauses})`,
    params
  );
  return r?.n || 0;
}

async function fetchCIIForHotspot(hotspot) {
  if (!hotspot.countries || hotspot.countries.length === 0) return null;
  const placeholders = hotspot.countries.map((_, i) => `$${i + 1}`).join(',');
  const r = await db.queryOne(
    `SELECT MAX(score)::int AS s
       FROM wm_country_scores
      WHERE code IN (${placeholders})`,
    hotspot.countries
  );
  return r?.s ?? null;
}

async function fetchMilitaryNearHotspot(hotspot, radiusKm, windowHours) {
  const wmhe = loadWmHotspotEsc();
  const bb = wmhe.boundingBox(hotspot.lat, hotspot.lon, radiusKm);

  // Bounding-box prefilter pulls a small candidate set, then we
  // refine with haversine in JS for accuracy at the edges.
  const flights = await db.queryAll(
    `SELECT lat, lon FROM wm_military_flights
      WHERE observed_at > NOW() - ($1::int * INTERVAL '1 hour')
        AND lat BETWEEN $2 AND $3
        AND lon BETWEEN $4 AND $5`,
    [windowHours, bb.minLat, bb.maxLat, bb.minLon, bb.maxLon]
  );
  const vessels = await db.queryAll(
    `SELECT lat, lon FROM wm_military_vessels
      WHERE observed_at > NOW() - ($1::int * INTERVAL '1 hour')
        AND lat BETWEEN $2 AND $3
        AND lon BETWEEN $4 AND $5`,
    [windowHours, bb.minLat, bb.maxLat, bb.minLon, bb.maxLon]
  );

  const flightCount = flights.filter(
    f => wmhe.haversineKm(hotspot.lat, hotspot.lon, f.lat, f.lon) <= radiusKm
  ).length;
  const vesselCount = vessels.filter(
    v => wmhe.haversineKm(hotspot.lat, hotspot.lon, v.lat, v.lon) <= radiusKm
  ).length;
  return { flights: flightCount, vessels: vesselCount };
}

async function fetchGeoConvergenceForHotspot(hotspot, _radiusKm) {
  // wm_signal_summary stores aggregated convergence zones as JSONB.
  // Each zone is { region, countries: [ISO2…], signalTypes, totalSignals }.
  // Match-by-country: a hotspot is "near" a zone iff at least one of
  // its mapped country codes appears in the zone.countries array.
  // Intensity is derived from totalSignals (saturating around 100).
  const r = await db.queryOne(
    `SELECT convergence_zones FROM wm_signal_summary
      ORDER BY observed_at DESC LIMIT 1`
  );
  if (!r || !r.convergence_zones) return { zonesNearby: 0, maxIntensity: 0 };
  let raw = r.convergence_zones;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = []; }
  }
  if (!Array.isArray(raw)) return { zonesNearby: 0, maxIntensity: 0 };
  if (!Array.isArray(hotspot.countries) || hotspot.countries.length === 0) {
    return { zonesNearby: 0, maxIntensity: 0 };
  }
  const hotspotCountrySet = new Set(hotspot.countries);

  let zonesNearby = 0;
  let maxIntensity = 0;
  for (const z of raw) {
    const zoneCountries = Array.isArray(z?.countries) ? z.countries : [];
    const hit = zoneCountries.some(c => hotspotCountrySet.has(c));
    if (!hit) continue;
    zonesNearby++;
    // Saturate intensity contribution at 10 (multiplied by 10 in normalize → cap at 100).
    const totalSignals = Number(z.totalSignals || 0);
    const intensity = Math.min(10, Math.ceil(totalSignals / 10));
    if (intensity > maxIntensity) maxIntensity = intensity;
  }
  return { zonesNearby, maxIntensity };
}

async function fetchPrevHotspotScores() {
  const rows = await db.queryAll(
    `SELECT hotspot_id, combined_score FROM wm_hotspot_escalation`
  );
  const map = new Map();
  for (const r of rows) map.set(r.hotspot_id, Number(r.combined_score));
  return map;
}

async function persistHotspotEscalation(records) {
  let inserted = 0;
  let updated = 0;
  for (const rec of records) {
    const r = await db.queryOne(
      `INSERT INTO wm_hotspot_escalation
         (hotspot_id, static_baseline, dynamic_score, combined_score, trend,
          component_news, component_cii, component_geo, component_military,
          news_matches, cii_score, geo_zones_nearby,
          flights_nearby, vessels_nearby, prev_combined_score, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
       ON CONFLICT (hotspot_id) DO UPDATE SET
         static_baseline = EXCLUDED.static_baseline,
         dynamic_score = EXCLUDED.dynamic_score,
         combined_score = EXCLUDED.combined_score,
         trend = EXCLUDED.trend,
         component_news = EXCLUDED.component_news,
         component_cii = EXCLUDED.component_cii,
         component_geo = EXCLUDED.component_geo,
         component_military = EXCLUDED.component_military,
         news_matches = EXCLUDED.news_matches,
         cii_score = EXCLUDED.cii_score,
         geo_zones_nearby = EXCLUDED.geo_zones_nearby,
         flights_nearby = EXCLUDED.flights_nearby,
         vessels_nearby = EXCLUDED.vessels_nearby,
         prev_combined_score = EXCLUDED.prev_combined_score,
         computed_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        rec.hotspot_id,
        rec.static_baseline,
        rec.dynamic_score,
        rec.combined_score,
        rec.trend,
        rec.component_news,
        rec.component_cii,
        rec.component_geo,
        rec.component_military,
        rec.news_matches,
        rec.cii_score,
        rec.geo_zones_nearby,
        rec.flights_nearby,
        rec.vessels_nearby,
        rec.prev_combined_score,
      ]
    );
    if (r?.inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

async function runWmHotspotEscalationJob() {
  const t0 = Date.now();
  const wmhe = loadWmHotspotEsc();
  const hotspots = wmhe.getHotspots();
  const prev = await fetchPrevHotspotScores();
  const records = [];

  for (const h of hotspots) {
    const newsMatches = await fetchNewsMatchesForHotspot(h, wmhe.NEWS_WINDOW_HOURS);
    const ciiScore = await fetchCIIForHotspot(h);
    const military = await fetchMilitaryNearHotspot(
      h, wmhe.PROXIMITY_RADIUS_KM, wmhe.MILITARY_WINDOW_HOURS
    );
    const geo = await fetchGeoConvergenceForHotspot(h, wmhe.PROXIMITY_RADIUS_KM);

    const components = {
      news_activity:     wmhe.normalizeNews(newsMatches),
      cii_contribution:  wmhe.normalizeCII(ciiScore),
      geo_convergence:   wmhe.normalizeGeo(geo.zonesNearby, geo.maxIntensity),
      military_activity: wmhe.normalizeMilitary(military.flights, military.vessels),
    };
    const dynamicRaw = wmhe.combinedRaw(components);
    const dynamicScore = wmhe.rawToScore(dynamicRaw);
    const combinedScore = wmhe.blendScores(h.baseline, dynamicScore);
    const prevScore = prev.has(h.id) ? prev.get(h.id) : null;
    const delta = prevScore != null ? combinedScore - prevScore : 0;
    const trend = wmhe.trendFromDelta(delta);

    records.push({
      hotspot_id: h.id,
      static_baseline: Number(h.baseline.toFixed(1)),
      dynamic_score: Number(dynamicScore.toFixed(1)),
      combined_score: Number(combinedScore.toFixed(1)),
      trend,
      component_news: Number(components.news_activity.toFixed(2)),
      component_cii: Number(components.cii_contribution.toFixed(2)),
      component_geo: Number(components.geo_convergence.toFixed(2)),
      component_military: Number(components.military_activity.toFixed(2)),
      news_matches: newsMatches,
      cii_score: ciiScore,
      geo_zones_nearby: geo.zonesNearby,
      flights_nearby: military.flights,
      vessels_nearby: military.vessels,
      prev_combined_score: prevScore != null ? Number(prevScore.toFixed(1)) : null,
    });
  }

  const persistResult = await persistHotspotEscalation(records);
  const escalating = records.filter(r => r.trend === 'escalating').length;
  const critical = records.filter(r => r.combined_score >= 4.0).length;

  return {
    hotspotsProcessed: records.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    escalating,
    critical,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 3 — Bloque 1: market quotes + crypto quotes
//
//  Tablas wm_market_quotes y wm_crypto_quotes (db/wm_phase3.sql).
//  Append-only time-series. Bounded retention 90 días via cleanup.
// ════════════════════════════════════════════════════════════

const MARKET_QUOTES_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.MARKET_QUOTES_RETENTION_DAYS || '90', 10) || 90
);
const CRYPTO_QUOTES_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.CRYPTO_QUOTES_RETENTION_DAYS || '90', 10) || 90
);

async function persistMarketQuotes(quotes, observedAt) {
  let inserted = 0;
  for (const q of quotes) {
    if (!q || typeof q.price !== 'number' || !Number.isFinite(q.price)) continue;
    const r = await db.queryOne(
      `INSERT INTO wm_market_quotes
         (symbol, display, name, category, price, previous_close,
          change_abs, change_pct, day_high, day_low, volume,
          currency, exchange, market_state, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        String(q.symbol).slice(0, 30),
        q.display ? String(q.display).slice(0, 30) : null,
        q.name ? String(q.name).slice(0, 100) : null,
        String(q.category).slice(0, 20),
        Number(q.price),
        Number.isFinite(q.previousClose) ? Number(q.previousClose) : null,
        Number.isFinite(q.changeAbs) ? Number(q.changeAbs) : null,
        Number.isFinite(q.changePct) ? Number(q.changePct) : null,
        Number.isFinite(q.dayHigh) ? Number(q.dayHigh) : null,
        Number.isFinite(q.dayLow) ? Number(q.dayLow) : null,
        Number.isFinite(q.volume) ? Number(q.volume) : null,
        q.currency ? String(q.currency).slice(0, 10) : null,
        q.exchange ? String(q.exchange).slice(0, 60) : null,
        q.marketState ? String(q.marketState).slice(0, 20) : null,
        observedAt,
      ]
    );
    if (r?.id) inserted++;
  }
  return { inserted };
}

async function persistCryptoQuotes(quotes, observedAt) {
  let inserted = 0;
  for (const q of quotes) {
    if (!q || typeof q.priceUsd !== 'number' || !Number.isFinite(q.priceUsd)) continue;
    const r = await db.queryOne(
      `INSERT INTO wm_crypto_quotes
         (coin_id, symbol, name, price_usd, market_cap_usd, volume_24h_usd,
          change_1h_pct, change_24h_pct, change_7d_pct,
          ath_usd, ath_change_pct, circulating_supply,
          global_market_cap_usd, btc_dominance_pct, active_cryptocurrencies,
          observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        String(q.coinId).slice(0, 50),
        String(q.symbol).slice(0, 20),
        String(q.name).slice(0, 100),
        Number(q.priceUsd),
        Number.isFinite(q.marketCapUsd) ? Number(q.marketCapUsd) : null,
        Number.isFinite(q.volume24hUsd) ? Number(q.volume24hUsd) : null,
        Number.isFinite(q.change1hPct) ? Number(q.change1hPct) : null,
        Number.isFinite(q.change24hPct) ? Number(q.change24hPct) : null,
        Number.isFinite(q.change7dPct) ? Number(q.change7dPct) : null,
        Number.isFinite(q.athUsd) ? Number(q.athUsd) : null,
        Number.isFinite(q.athChangePct) ? Number(q.athChangePct) : null,
        Number.isFinite(q.circulatingSupply) ? Number(q.circulatingSupply) : null,
        Number.isFinite(q.globalMarketCapUsd) ? Number(q.globalMarketCapUsd) : null,
        Number.isFinite(q.btcDominancePct) ? Number(q.btcDominancePct) : null,
        Number.isFinite(q.activeCryptocurrencies) ? Number(q.activeCryptocurrencies) : null,
        observedAt,
      ]
    );
    if (r?.id) inserted++;
  }
  return { inserted };
}

async function cleanupOldMarketQuotes(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_market_quotes
                  WHERE observed_at < NOW() - ($1::int * INTERVAL '1 day')
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function cleanupOldCryptoQuotes(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_crypto_quotes
                  WHERE observed_at < NOW() - ($1::int * INTERVAL '1 day')
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function runMarketQuotesJob() {
  const t0 = Date.now();
  const observedAt = new Date();
  const mq = loadMarketQuotes();
  let quotes = [];
  try {
    quotes = await mq.fetchAllMarketQuotes();
  } catch (err) {
    return {
      fetched: 0,
      inserted: 0,
      deleted: 0,
      durationMs: Date.now() - t0,
      error: err.message,
    };
  }
  const persistResult = await persistMarketQuotes(quotes, observedAt);
  // Cleanup runs sparingly — only on the top-of-hour tick to avoid hot-path
  // overhead. We approximate "top of hour" by checking minute < 15 (the
  // job runs */15 13-21 * * 1-5 → first tick of an hour is :00 / :15 / :30 / :45,
  // so :00 is the only minute under 15).
  let deleted = 0;
  if (observedAt.getUTCMinutes() < 15) {
    deleted = await cleanupOldMarketQuotes(MARKET_QUOTES_RETENTION_DAYS);
  }
  return {
    fetched: quotes.length,
    inserted: persistResult.inserted,
    deleted,
    durationMs: Date.now() - t0,
  };
}

async function runCryptoQuotesJob() {
  const t0 = Date.now();
  const observedAt = new Date();
  const cq = loadCryptoQuotes();
  let quotes = [];
  try {
    quotes = await cq.fetchAllCryptoQuotes();
  } catch (err) {
    return {
      fetched: 0,
      inserted: 0,
      deleted: 0,
      durationMs: Date.now() - t0,
      error: err.message,
    };
  }
  const persistResult = await persistCryptoQuotes(quotes, observedAt);
  // Cleanup once per hour at the top-of-hour 5min tick.
  let deleted = 0;
  if (observedAt.getUTCMinutes() < 5) {
    deleted = await cleanupOldCryptoQuotes(CRYPTO_QUOTES_RETENTION_DAYS);
  }
  return {
    fetched: quotes.length,
    inserted: persistResult.inserted,
    deleted,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 3 — Bloque 2: energy inventories + FX rates
//
//  Tablas wm_energy_inventories y wm_fx_rates (db/wm_phase3.sql).
//  Energy: UPSERT (series_id, period). Sin retention pruning, dataset
//  pequeño (~200 rows/año total).
//  FX: UPSERT (base, quote, rate_date). Retention 730 días para
//  mantener bounded.
// ════════════════════════════════════════════════════════════

const FX_RATES_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.FX_RATES_RETENTION_DAYS || '730', 10) || 730
);

async function persistEnergyInventories(rows) {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    if (!r || typeof r.value !== 'number' || !Number.isFinite(r.value)) continue;
    const res = await db.queryOne(
      `INSERT INTO wm_energy_inventories
         (series_id, category, display, description, period, value, unit,
          prev_value, change_abs, change_pct, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (series_id, period) DO UPDATE SET
         category    = EXCLUDED.category,
         display     = EXCLUDED.display,
         description = EXCLUDED.description,
         value       = EXCLUDED.value,
         unit        = EXCLUDED.unit,
         prev_value  = EXCLUDED.prev_value,
         change_abs  = EXCLUDED.change_abs,
         change_pct  = EXCLUDED.change_pct,
         fetched_at  = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        String(r.seriesId).slice(0, 60),
        String(r.category).slice(0, 20),
        String(r.display).slice(0, 120),
        r.description ? String(r.description).slice(0, 300) : null,
        r.period,                                           // YYYY-MM-DD string OK for DATE
        Number(r.value),
        String(r.unit || '').slice(0, 20),
        Number.isFinite(r.prevValue) ? Number(r.prevValue) : null,
        Number.isFinite(r.changeAbs) ? Number(r.changeAbs) : null,
        Number.isFinite(r.changePct) ? Number(r.changePct) : null,
      ]
    );
    if (res?.inserted === true) inserted++;
    else if (res) updated++;
  }
  return { inserted, updated };
}

async function persistFxRates(rows) {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    if (!r || typeof r.rate !== 'number' || !Number.isFinite(r.rate)) continue;
    const res = await db.queryOne(
      `INSERT INTO wm_fx_rates
         (base, quote, rate, rate_date, prev_rate, prev_date,
          change_abs, change_pct, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (base, quote, rate_date) DO UPDATE SET
         rate       = EXCLUDED.rate,
         prev_rate  = EXCLUDED.prev_rate,
         prev_date  = EXCLUDED.prev_date,
         change_abs = EXCLUDED.change_abs,
         change_pct = EXCLUDED.change_pct,
         fetched_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        String(r.base).slice(0, 10),
        String(r.quote).slice(0, 10),
        Number(r.rate),
        r.rateDate,
        Number.isFinite(r.prevRate) ? Number(r.prevRate) : null,
        r.prevDate || null,
        Number.isFinite(r.changeAbs) ? Number(r.changeAbs) : null,
        Number.isFinite(r.changePct) ? Number(r.changePct) : null,
      ]
    );
    if (res?.inserted === true) inserted++;
    else if (res) updated++;
  }
  return { inserted, updated };
}

async function cleanupOldFxRates(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_fx_rates
                  WHERE rate_date < (CURRENT_DATE - ($1::int))
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function runEnergyInventoriesJob() {
  const t0 = Date.now();
  const apiKey = process.env.EIA_API_KEY || '';
  if (!apiKey) {
    return { fetched: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0, error: 'EIA_API_KEY missing' };
  }
  const ei = loadEnergyInventories();
  let rows = [];
  try {
    rows = await ei.fetchAllEnergyInventories(apiKey);
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistEnergyInventories(rows);
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

async function runFxRatesJob() {
  const t0 = Date.now();
  const fx = loadFxRates();
  let rows = [];
  try {
    rows = await fx.fetchAllFxRates();
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, deleted: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistFxRates(rows);
  let deleted = 0;
  try {
    deleted = await cleanupOldFxRates(FX_RATES_RETENTION_DAYS);
  } catch (err) {
    console.warn('[fx-rates] cleanup failed:', err.message);
  }
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    deleted,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 3 — Bloque 3: macro indicators + agri commodities
//
//  Tablas wm_macro_indicators y wm_agri_commodities (db/wm_phase3.sql).
//  Ambas UPSERT idempotentes; sin retention pruning (datasets pequeños).
// ════════════════════════════════════════════════════════════

async function persistMacroIndicators(rows) {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    if (!r || typeof r.value !== 'number' || !Number.isFinite(r.value)) continue;
    const res = await db.queryOne(
      `INSERT INTO wm_macro_indicators
         (source, indicator_id, display, category, area, frequency,
          period, value, unit, prev_value, prev_period,
          change_abs, change_pct, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (source, indicator_id, area, period) DO UPDATE SET
         display     = EXCLUDED.display,
         category    = EXCLUDED.category,
         frequency   = EXCLUDED.frequency,
         value       = EXCLUDED.value,
         unit        = EXCLUDED.unit,
         prev_value  = EXCLUDED.prev_value,
         prev_period = EXCLUDED.prev_period,
         change_abs  = EXCLUDED.change_abs,
         change_pct  = EXCLUDED.change_pct,
         fetched_at  = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        String(r.source).slice(0, 20),
        String(r.indicatorId).slice(0, 60),
        String(r.display).slice(0, 200),
        String(r.category).slice(0, 30),
        String(r.area).slice(0, 10),
        String(r.frequency).slice(0, 20),
        r.period,
        Number(r.value),
        r.unit ? String(r.unit).slice(0, 30) : null,
        Number.isFinite(r.prevValue) ? Number(r.prevValue) : null,
        r.prevPeriod || null,
        Number.isFinite(r.changeAbs) ? Number(r.changeAbs) : null,
        Number.isFinite(r.changePct) ? Number(r.changePct) : null,
      ]
    );
    if (res?.inserted === true) inserted++;
    else if (res) updated++;
  }
  return { inserted, updated };
}

async function persistAgriCommodities(rows) {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    if (!r || typeof r.value !== 'number' || !Number.isFinite(r.value)) continue;
    const res = await db.queryOne(
      `INSERT INTO wm_agri_commodities
         (commodity, category, metric, display, short_desc, area,
          period, reference, value, unit, prev_value, prev_period,
          change_abs, change_pct, load_time, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
       ON CONFLICT (commodity, metric, area, period) DO UPDATE SET
         category    = EXCLUDED.category,
         display     = EXCLUDED.display,
         short_desc  = EXCLUDED.short_desc,
         reference   = EXCLUDED.reference,
         value       = EXCLUDED.value,
         unit        = EXCLUDED.unit,
         prev_value  = EXCLUDED.prev_value,
         prev_period = EXCLUDED.prev_period,
         change_abs  = EXCLUDED.change_abs,
         change_pct  = EXCLUDED.change_pct,
         load_time   = EXCLUDED.load_time,
         fetched_at  = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        String(r.commodity).slice(0, 50),
        String(r.category).slice(0, 30),
        String(r.metric).slice(0, 30),
        String(r.display).slice(0, 200),
        r.shortDesc ? String(r.shortDesc).slice(0, 200) : null,
        String(r.area).slice(0, 20),
        r.period,
        r.reference ? String(r.reference).slice(0, 60) : null,
        Number(r.value),
        String(r.unit).slice(0, 30),
        Number.isFinite(r.prevValue) ? Number(r.prevValue) : null,
        r.prevPeriod || null,
        Number.isFinite(r.changeAbs) ? Number(r.changeAbs) : null,
        Number.isFinite(r.changePct) ? Number(r.changePct) : null,
        r.loadTime || null,
      ]
    );
    if (res?.inserted === true) inserted++;
    else if (res) updated++;
  }
  return { inserted, updated };
}

async function runMacroIndicatorsJob() {
  const t0 = Date.now();
  const fredKey = process.env.FRED_API_KEY || '';
  if (!fredKey) {
    return { fetched: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0, error: 'FRED_API_KEY missing' };
  }
  const mi = loadMacroIndicators();
  let rows = [];
  try {
    rows = await mi.fetchAllMacroIndicators(fredKey);
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistMacroIndicators(rows);
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

async function runAgriCommoditiesJob() {
  const t0 = Date.now();
  const usdaKey = process.env.USDA_API_KEY || '';
  if (!usdaKey) {
    return { fetched: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0, error: 'USDA_API_KEY missing' };
  }
  const ag = loadAgriCommodities();
  let rows = [];
  try {
    rows = await ag.fetchAllAgriCommodities(usdaKey);
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistAgriCommodities(rows);
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

// ─── WM Phase 3 Bloque 4 Sub 4a: prediction markets (Manifold) ──
// Generic persist function — same shape feeds Kalshi/Metaculus/
// Polymarket in 4b/4c/4d. UPSERT por (source, source_market_id).
// Each successful upsert also inserts one snapshot row in the
// child table for time-series tracking.
async function persistPredictionMarkets(rows) {
  let inserted = 0, updated = 0, snapshotted = 0, skipped = 0;
  for (const r of rows) {
    if (!r || !r.sourceMarketId || !r.question || !r.source || !r.marketType || !r.status || !r.currency) {
      skipped++;
      continue;
    }
    const upsert = await db.queryOne(
      `INSERT INTO wm_prediction_markets
         (source, source_market_id, source_event_id, slug, url,
          question, description, category, raw_tags, market_type,
          outcomes, probability, volume, liquidity, open_interest,
          currency, trader_count, opened_at, closes_at, resolved_at,
          resolution, resolution_source, status, last_fetched_at, raw)
       VALUES ($1,$2,$3,$4,$5,
               $6,$7,$8,$9,$10,
               $11,$12,$13,$14,$15,
               $16,$17,$18,$19,$20,
               $21,$22,$23,NOW(),$24)
       ON CONFLICT (source, source_market_id) DO UPDATE SET
         source_event_id   = EXCLUDED.source_event_id,
         slug              = EXCLUDED.slug,
         url               = EXCLUDED.url,
         question          = EXCLUDED.question,
         description       = COALESCE(EXCLUDED.description, wm_prediction_markets.description),
         category          = EXCLUDED.category,
         raw_tags          = EXCLUDED.raw_tags,
         market_type       = EXCLUDED.market_type,
         outcomes          = EXCLUDED.outcomes,
         probability       = EXCLUDED.probability,
         volume            = EXCLUDED.volume,
         liquidity         = EXCLUDED.liquidity,
         open_interest     = EXCLUDED.open_interest,
         currency          = EXCLUDED.currency,
         trader_count      = EXCLUDED.trader_count,
         opened_at         = EXCLUDED.opened_at,
         closes_at         = EXCLUDED.closes_at,
         resolved_at       = EXCLUDED.resolved_at,
         resolution        = EXCLUDED.resolution,
         resolution_source = EXCLUDED.resolution_source,
         status            = EXCLUDED.status,
         last_fetched_at   = NOW(),
         raw               = EXCLUDED.raw
       RETURNING id, (xmax = 0) AS inserted`,
      [
        String(r.source).slice(0, 20),
        String(r.sourceMarketId).slice(0, 100),
        r.sourceEventId ? String(r.sourceEventId).slice(0, 100) : null,
        r.slug ? String(r.slug).slice(0, 200) : null,
        r.url ? String(r.url).slice(0, 500) : null,
        String(r.question).slice(0, 1000),
        r.description ? String(r.description).slice(0, 4000) : null,
        Array.isArray(r.category) ? r.category : [],
        Array.isArray(r.rawTags) ? r.rawTags : [],
        String(r.marketType).slice(0, 30),
        r.outcomes ? JSON.stringify(r.outcomes) : null,
        Number.isFinite(r.probability) ? Number(r.probability) : null,
        Number.isFinite(r.volume) ? Number(r.volume) : null,
        Number.isFinite(r.liquidity) ? Number(r.liquidity) : null,
        Number.isFinite(r.openInterest) ? Number(r.openInterest) : null,
        String(r.currency).slice(0, 10),
        Number.isFinite(r.traderCount) ? Number(r.traderCount) : null,
        r.openedAt || null,
        r.closesAt || null,
        r.resolvedAt || null,
        r.resolution ? String(r.resolution).slice(0, 200) : null,
        r.resolutionSource ? String(r.resolutionSource).slice(0, 500) : null,
        String(r.status).slice(0, 20),
        r.raw ? JSON.stringify(r.raw) : null,
      ]
    );
    if (!upsert || !upsert.id) { skipped++; continue; }
    if (upsert.inserted === true) inserted++;
    else updated++;

    // Always append a snapshot row — one row per cron tick per market.
    await db.queryOne(
      `INSERT INTO wm_prediction_market_snapshots
         (market_id, captured_at, probability, outcomes, volume, liquidity)
       VALUES ($1, NOW(), $2, $3, $4, $5)
       RETURNING id`,
      [
        upsert.id,
        Number.isFinite(r.probability) ? Number(r.probability) : null,
        r.outcomes ? JSON.stringify(r.outcomes) : null,
        Number.isFinite(r.volume) ? Number(r.volume) : null,
        Number.isFinite(r.liquidity) ? Number(r.liquidity) : null,
      ]
    );
    snapshotted++;
  }
  return { inserted, updated, snapshotted, skipped };
}

async function runManifoldMarketsJob() {
  const t0 = Date.now();
  const mm = loadManifoldMarkets();
  let rows = [];
  try {
    rows = await mm.fetchAllManifoldMarkets();
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, snapshotted: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistPredictionMarkets(rows);
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    snapshotted: persistResult.snapshotted,
    skipped: persistResult.skipped,
    durationMs: Date.now() - t0,
  };
}

async function runKalshiMarketsJob() {
  const t0 = Date.now();
  const km = loadKalshiMarkets();
  let rows = [];
  try {
    rows = await km.fetchAllKalshiMarkets();
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, snapshotted: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistPredictionMarkets(rows);
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    snapshotted: persistResult.snapshotted,
    skipped: persistResult.skipped,
    durationMs: Date.now() - t0,
  };
}

async function runPolymarketMarketsJob() {
  const t0 = Date.now();
  const pm = loadPolymarketMarkets();
  let rows = [];
  try {
    rows = await pm.fetchAllPolymarketMarkets();
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, snapshotted: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistPredictionMarkets(rows);
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    snapshotted: persistResult.snapshotted,
    skipped: persistResult.skipped,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 3 — Bloque 5 Sub-A: Cyber CVEs (NIST NVD + CISA KEV)
//
//  Tabla wm_cyber_cves (db/wm_phase3.sql). UPSERT por cve_id —
//  re-runs son no-op cuando NVD no ha publicado nuevos CVEs ni CISA
//  ha añadido nuevas entradas a KEV. Cron */60 (cada hora) — NVD
//  publica en bursts irregulares, no hay ganancia con frecuencia
//  más alta y rate-limit anon es 5 req/30s.
// ════════════════════════════════════════════════════════════

const CYBER_CVES_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.CYBER_CVES_RETENTION_DAYS || '365', 10) || 365
);

async function persistCyberCves(rows) {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    if (!r || !r.cveId) continue;
    const res = await db.queryOne(
      `INSERT INTO wm_cyber_cves
         (cve_id, source, published_at, last_modified, cvss_version,
          cvss_score, cvss_severity, cvss_vector, kev_flag,
          kev_added_date, kev_due_date, vendors, products, cwe_ids,
          description, reference_count, fetched_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$17)
       ON CONFLICT (cve_id) DO UPDATE SET
         source          = EXCLUDED.source,
         published_at    = EXCLUDED.published_at,
         last_modified   = EXCLUDED.last_modified,
         cvss_version    = EXCLUDED.cvss_version,
         cvss_score      = EXCLUDED.cvss_score,
         cvss_severity   = EXCLUDED.cvss_severity,
         cvss_vector     = EXCLUDED.cvss_vector,
         kev_flag        = EXCLUDED.kev_flag,
         kev_added_date  = EXCLUDED.kev_added_date,
         kev_due_date    = EXCLUDED.kev_due_date,
         vendors         = EXCLUDED.vendors,
         products        = EXCLUDED.products,
         cwe_ids         = EXCLUDED.cwe_ids,
         description     = COALESCE(EXCLUDED.description, wm_cyber_cves.description),
         reference_count = EXCLUDED.reference_count,
         fetched_at      = NOW(),
         raw             = EXCLUDED.raw
       RETURNING (xmax = 0) AS inserted`,
      [
        String(r.cveId).slice(0, 50),
        String(r.source || 'NVD').slice(0, 20),
        r.publishedAt,
        r.lastModified,
        r.cvssVersion ? String(r.cvssVersion).slice(0, 10) : null,
        Number.isFinite(r.cvssScore) ? Number(r.cvssScore) : null,
        r.cvssSeverity ? String(r.cvssSeverity).slice(0, 20) : null,
        r.cvssVector ? String(r.cvssVector).slice(0, 200) : null,
        Boolean(r.kevFlag),
        r.kevAddedDate || null,
        r.kevDueDate || null,
        Array.isArray(r.vendors) ? r.vendors.slice(0, 20) : [],
        Array.isArray(r.products) ? r.products.slice(0, 20) : [],
        Array.isArray(r.cweIds) ? r.cweIds.slice(0, 10) : [],
        r.description ? String(r.description).slice(0, 4000) : null,
        Number.isFinite(r.referenceCount) ? Number(r.referenceCount) : 0,
        r.raw ? JSON.stringify(r.raw) : null,
      ]
    );
    if (res?.inserted === true) inserted++;
    else if (res) updated++;
  }
  return { inserted, updated };
}

async function cleanupOldCyberCves(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_cyber_cves
                  WHERE published_at < NOW() - ($1::int * INTERVAL '1 day')
                    AND kev_flag = FALSE
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function runCyberCvesJob() {
  const t0 = Date.now();
  const cc = loadCyberCves();
  let rows = [];
  try {
    rows = await cc.fetchAllCyberCves({
      daysWindow: parseInt(process.env.CYBER_CVES_WINDOW_DAYS || '30', 10) || 30,
      minCvss: parseFloat(process.env.CYBER_CVES_MIN_CVSS || '7.0') || 7.0,
      apiKey: process.env.NVD_API_KEY || null,
    });
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, deleted: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistCyberCves(rows);
  let deleted = 0;
  try {
    deleted = await cleanupOldCyberCves(CYBER_CVES_RETENTION_DAYS);
  } catch (err) {
    console.warn('[cyber-cves] cleanup failed:', err.message);
  }
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    deleted,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 3 — Bloque 5 Sub-B: Cloudflare Radar internet outages
//
//  Tabla wm_internet_outages. UPSERT por source_id (Cloudflare's
//  stable annotation id). End_date transitions null → ISO when CF
//  closes the outage; UPSERT updates that.
// ════════════════════════════════════════════════════════════

async function persistInternetOutages(rows) {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    if (!r || !r.sourceId || !r.startDate) continue;
    const res = await db.queryOne(
      `INSERT INTO wm_internet_outages
         (source_id, outage_type, scope, location_code, location_name,
          asn, asn_name, event_type, description, link_url,
          start_date, end_date, is_ongoing, first_seen_at, last_seen_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW(),$14)
       ON CONFLICT (source_id) DO UPDATE SET
         outage_type   = EXCLUDED.outage_type,
         scope         = EXCLUDED.scope,
         location_code = EXCLUDED.location_code,
         location_name = EXCLUDED.location_name,
         asn           = EXCLUDED.asn,
         asn_name      = EXCLUDED.asn_name,
         event_type    = EXCLUDED.event_type,
         description   = EXCLUDED.description,
         link_url      = EXCLUDED.link_url,
         start_date    = EXCLUDED.start_date,
         end_date      = EXCLUDED.end_date,
         is_ongoing    = EXCLUDED.is_ongoing,
         last_seen_at  = NOW(),
         raw           = EXCLUDED.raw
       RETURNING (xmax = 0) AS inserted`,
      [
        String(r.sourceId).slice(0, 100),
        r.outageType ? String(r.outageType).slice(0, 60) : null,
        r.scope ? String(r.scope).slice(0, 30) : null,
        r.locationCode ? String(r.locationCode).slice(0, 10) : null,
        r.locationName ? String(r.locationName).slice(0, 200) : null,
        r.asn ? String(r.asn).slice(0, 30) : null,
        r.asnName ? String(r.asnName).slice(0, 200) : null,
        r.eventType ? String(r.eventType).slice(0, 60) : null,
        r.description ? String(r.description).slice(0, 4000) : null,
        r.linkUrl ? String(r.linkUrl).slice(0, 500) : null,
        r.startDate,
        r.endDate || null,
        Boolean(r.isOngoing),
        r.raw ? JSON.stringify(r.raw) : null,
      ]
    );
    if (res?.inserted === true) inserted++;
    else if (res) updated++;
  }
  return { inserted, updated };
}

async function runCloudflareRadarOutagesJob() {
  const t0 = Date.now();
  const token = process.env.CLOUDFLARE_RADAR_TOKEN || '';
  if (!token) {
    return { fetched: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0, error: 'CLOUDFLARE_RADAR_TOKEN missing' };
  }
  const cf = loadCloudflareRadarOutages();
  let rows = [];
  try {
    rows = await cf.fetchAllInternetOutages(token);
  } catch (err) {
    return { fetched: 0, inserted: 0, updated: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistInternetOutages(rows);
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    updated: persistResult.updated,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 3 — Bloque 5 Sub-D: Commercial flights (OpenSky non-mil)
//
//  Tabla wm_commercial_flights. Append-only snapshot por
//  (icao24, observed_at). Retention 7 días.
// ════════════════════════════════════════════════════════════

const COMMERCIAL_FLIGHTS_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.COMMERCIAL_FLIGHTS_RETENTION_DAYS || '7', 10) || 7
);

async function persistCommercialFlights(rows, observedAt) {
  let inserted = 0;
  for (const r of rows) {
    if (!r || !r.icao24 || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    const res = await db.queryOne(
      `INSERT INTO wm_commercial_flights
         (icao24, callsign, origin_country, lat, lon,
          altitude_ft, heading_deg, speed_kt, vertical_rate_fpm,
          on_ground, squawk, region, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (icao24, observed_at) DO NOTHING
       RETURNING id`,
      [
        String(r.icao24).toLowerCase().slice(0, 10),
        r.callsign ? String(r.callsign).slice(0, 30) : null,
        r.originCountry ? String(r.originCountry).slice(0, 60) : null,
        Number(r.lat),
        Number(r.lon),
        Number.isFinite(r.altitudeFt) ? Math.round(r.altitudeFt) : null,
        Number.isFinite(r.headingDeg) ? Number(r.headingDeg) : null,
        Number.isFinite(r.speedKt) ? Math.round(r.speedKt) : null,
        Number.isFinite(r.verticalRateFpm) ? Math.round(r.verticalRateFpm) : null,
        Boolean(r.onGround),
        r.squawk ? String(r.squawk).slice(0, 10) : null,
        String(r.region || 'unknown').slice(0, 10),
        observedAt,
      ]
    );
    if (res?.id) inserted++;
  }
  return { inserted };
}

async function cleanupOldCommercialFlights(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_commercial_flights
                  WHERE observed_at < NOW() - ($1::int * INTERVAL '1 day')
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function runCommercialFlightsJob() {
  const t0 = Date.now();
  const observedAt = new Date();
  const cf = loadCommercialFlights();
  let rows = [];
  try {
    rows = await cf.fetchAllCommercialFlights();
  } catch (err) {
    return { fetched: 0, inserted: 0, deleted: 0, durationMs: Date.now() - t0, error: err.message };
  }
  const persistResult = await persistCommercialFlights(rows, observedAt);
  // Cleanup once per hour at the top-of-hour tick (matches market-quotes pattern)
  let deleted = 0;
  if (observedAt.getUTCMinutes() < 15) {
    deleted = await cleanupOldCommercialFlights(COMMERCIAL_FLIGHTS_RETENTION_DAYS);
  }
  return {
    fetched: rows.length,
    inserted: persistResult.inserted,
    deleted,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 3 — Bloque 5 Sub-D: Commercial vessels (AISStream fan-out)
//
//  Tabla wm_commercial_vessels. The aisstream_subscriber.js fans out
//  each AIS message to commercial-vessels.processCommercialAisPosition,
//  which keeps an in-memory map of cargo/tanker vessels (AIS ship
//  type 70-89). This job snapshots the map periodically.
// ════════════════════════════════════════════════════════════

const COMMERCIAL_VESSELS_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.COMMERCIAL_VESSELS_RETENTION_DAYS || '7', 10) || 7
);

async function persistCommercialVessels(vessels, observedAt) {
  let inserted = 0;
  for (const v of vessels) {
    if (!v || !v.mmsi || !Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue;
    const res = await db.queryOne(
      `INSERT INTO wm_commercial_vessels
         (mmsi, vessel_name, ais_ship_type, ais_ship_type_name, category,
          flag_country, lat, lon, heading_deg, speed_kt, course_deg,
          destination, near_chokepoint, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (mmsi, observed_at) DO NOTHING
       RETURNING id`,
      [
        String(v.mmsi).slice(0, 20),
        v.name ? String(v.name).slice(0, 100) : null,
        Number.isFinite(v.aisShipType) ? Number(v.aisShipType) : null,
        v.aisShipTypeName ? String(v.aisShipTypeName).slice(0, 60) : null,
        String(v.category || 'other').slice(0, 20),
        v.flagCountry ? String(v.flagCountry).slice(0, 60) : null,
        Number(v.lat),
        Number(v.lon),
        Number.isFinite(v.heading) ? Number(v.heading) : null,
        Number.isFinite(v.speed) ? Number(v.speed) : null,
        Number.isFinite(v.course) ? Number(v.course) : null,
        v.destination ? String(v.destination).slice(0, 200) : null,
        v.nearChokepoint ? String(v.nearChokepoint).slice(0, 60) : null,
        observedAt,
      ]
    );
    if (res?.id) inserted++;
  }
  return { inserted };
}

async function cleanupOldCommercialVessels(retentionDays) {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_commercial_vessels
                  WHERE observed_at < NOW() - ($1::int * INTERVAL '1 day')
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return r?.deleted || 0;
}

async function runCommercialVesselsJob() {
  const t0 = Date.now();
  const observedAt = new Date();
  const cv = loadCommercialVessels();
  const vessels = cv.getTrackedCommercialVessels();
  const persistResult = await persistCommercialVessels(vessels, observedAt);
  let deleted = 0;
  if (observedAt.getUTCMinutes() < 15) {
    deleted = await cleanupOldCommercialVessels(COMMERCIAL_VESSELS_RETENTION_DAYS);
  }
  // Aggregate stats for the cron logger
  const byCategory = {};
  const byChokepoint = {};
  for (const v of vessels) {
    const cat = v.category || 'other';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (v.nearChokepoint) {
      byChokepoint[v.nearChokepoint] = (byChokepoint[v.nearChokepoint] || 0) + 1;
    }
  }
  return {
    tracked: vessels.length,
    inserted: persistResult.inserted,
    deleted,
    byCategory,
    byChokepoint,
    durationMs: Date.now() - t0,
  };
}

// ════════════════════════════════════════════════════════════
//  Phase 3 — Bloque 5: Correlation runner (Phase 2 closure)
//
//  Reads recent rows from wm_market_quotes / wm_crypto_quotes /
//  wm_fx_rates / wm_prediction_markets+snapshots / wm_cyber_cves /
//  wm_internet_outages, runs mechanical detectors with dedup, and
//  persists the resulting CorrelationSignal rows to
//  wm_correlation_signals. See worldmonitor/services/correlation-runner.ts
//  for the detector logic and threshold knobs.
// ════════════════════════════════════════════════════════════

const CORRELATION_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.CORRELATION_RETENTION_DAYS || '90', 10) || 90
);

async function runCorrelationJob() {
  const t0 = Date.now();
  const cr = loadCorrelationRunner();
  let stats;
  try {
    stats = await cr.runCorrelationDetectors(db);
  } catch (err) {
    return { emitted: 0, durationMs: Date.now() - t0, error: err.message };
  }
  let deleted = 0;
  // Cleanup once per hour at the top-of-hour tick
  if (new Date().getUTCMinutes() < 15) {
    try {
      deleted = await cr.cleanupOldCorrelationSignals(db, CORRELATION_RETENTION_DAYS);
    } catch (err) {
      console.warn('[correlation] cleanup failed:', err.message);
    }
  }
  return { ...stats, deleted, durationMs: Date.now() - t0 };
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
  runNaturalEventsJob,
  runEarthquakesJob,
  runSatelliteFiresJob,
  runWmGdeltIntelJob,
  runWmHotspotEscalationJob,
  runMarketQuotesJob,
  runCryptoQuotesJob,
  runEnergyInventoriesJob,
  runFxRatesJob,
  runMacroIndicatorsJob,
  runAgriCommoditiesJob,
  runManifoldMarketsJob,
  runKalshiMarketsJob,
  runPolymarketMarketsJob,
  runCyberCvesJob,
  runCloudflareRadarOutagesJob,
  runCommercialFlightsJob,
  runCommercialVesselsJob,
  runCorrelationJob,
  persistCyberCves,            // exported for testing
  persistInternetOutages,      // exported for testing
  persistCommercialFlights,    // exported for testing
  persistCommercialVessels,    // exported for testing
  cleanupOldCyberCves,         // exported for testing
  cleanupOldCommercialFlights, // exported for testing
  cleanupOldCommercialVessels, // exported for testing
  persistPredictionMarkets,    // exported for testing
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
  persistNaturalEvents,        // exported for testing
  persistEarthquakes,          // exported for testing
  persistSatelliteFires,       // exported for testing
  cleanupOldNaturalEvents,     // exported for testing
  cleanupOldEarthquakes,       // exported for testing
  cleanupOldSatelliteFires,    // exported for testing
  persistIntelArticles,        // exported for testing
  cleanupOldIntelArticles,     // exported for testing
  persistMarketQuotes,         // exported for testing
  persistCryptoQuotes,         // exported for testing
  cleanupOldMarketQuotes,      // exported for testing
  cleanupOldCryptoQuotes,      // exported for testing
  persistEnergyInventories,    // exported for testing
  persistFxRates,              // exported for testing
  cleanupOldFxRates,           // exported for testing
  persistMacroIndicators,      // exported for testing
  persistAgriCommodities,      // exported for testing
  getRecentMilitaryFlights,    // exported for testing
  getCurrentSignalSummary,     // exported for testing
  getRecentEarthquakeAnomalies,// exported for testing
  getRecentSatelliteFires,     // exported for testing
};
