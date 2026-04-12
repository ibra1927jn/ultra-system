// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Scheduler (reemplaza n8n)                ║
// ║  Cron jobs propios para todos los pilares                ║
// ║  Smart: budget alerts, pipeline reminders, bio weekly    ║
// ╚══════════════════════════════════════════════════════════╝

const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');
const freelanceScraper = require('./freelance_scraper');
const newsApis = require('./news_apis');
const fx = require('./fx');
const wise = require('./wise');
const weatherMod = require('./weather');
const docNz = require('./doc_nz');
const healthScrapers = require('./health_scrapers');
const externalHealth = require('./external_health');
const oppFetchers = require('./opp_fetchers');
const jobApis = require('./job_apis');
const cdio = require('./changedetection');
const intelWatches = require('./intel_watches');
const recurring = require('./recurring');
const cryptoMod = require('./crypto');
const dedupRunner = require('./dedup_runner');
const earlyWarning = require('./early_warning');
const govJobs = require('./gov_jobs');
const traccar = require('./traccar');
const govGrants = require('./gov_grants');

const jobs = [];

/**
 * Inicializa todos los cron jobs
 */
function init() {
  console.log('⏰ Iniciando scheduler...');

  // ─── P4: Burocracia — Multi-stage doc alerts diario 09:00 ───
  // Reemplaza document-expiry-check + urgent-document-check (subsumidos)
  register(
    'document-expiry-multistage',
    '0 9 * * *',
    checkDocumentExpiry,
    'Diario 09:00 — Multi-stage alerts (90/60/30/7 días)'
  );

  // ─── P4: Burocracia — Tax deadlines diario 09:10 ───
  register(
    'tax-deadlines',
    '10 9 * * *',
    checkTaxDeadlines,
    'Diario 09:10 — Recordatorios fiscales (NZ/ES/AU)'
  );

  // ─── P4: Burocracia — Vacunaciones lunes 10:00 ───
  register(
    'vaccination-expiry',
    '0 10 * * 1',
    checkVaccinationExpiry,
    'Lunes 10:00 — Vacunaciones próximas a expirar (<60 días)'
  );

  // ─── P4 R4: Burocracia — Apostilles + driver licenses + military lunes 10:05 ───
  register(
    'bur-docs-expiry',
    '5 10 * * 1',
    checkBurDocsExpiry,
    'Lunes 10:05 — Apostilles/driver licenses/military obligations próximos a expirar (<90 días)'
  );

  // ─── P4 Fase 2: changedetection.io sync (boot + diario 04:30) ───
  register(
    'cdio-sync',
    '30 4 * * *',
    syncCdioWatches,
    'Diario 04:30 — Sync bur_gov_watches → changedetection.io'
  );
  // Boot sync diferido 30s para que cdio container esté listo
  setTimeout(() => syncCdioWatches().catch(() => {}), 30_000);

  // ─── P1 Lote A B5: intel-watches sync (boot + diario 04:40) ───
  // Comparte container CDIO con P4 pero usa tabla intel_watches
  // (separación pillars). 23 country watches @3h + 10 policy @1h.
  register(
    'intel-watches-sync',
    '40 4 * * *',
    syncIntelWatchesJob,
    'Diario 04:40 — Sync intel_watches → changedetection.io (33 watches B5)'
  );
  setTimeout(() => syncIntelWatchesJob().catch(() => {}), 35_000);

  // ─── P3 Fase 2: Recurring detection — semanal lunes 03:00 ───
  register(
    'recurring-detect',
    '0 3 * * 1',
    detectRecurringExpenses,
    'Lunes 03:00 — Detección gastos recurrentes (lookback 365d)'
  );

  // ─── P1 Fase 2: MinHash+LSH dedup — diario 03:30 ───
  register(
    'minhash-dedup',
    '30 3 * * *',
    runMinhashDedup,
    'Diario 03:30 — Dedup cross-table (rss + opps + jobs) MinHash threshold 0.7'
  );

  // ─── P1 Fase 2: Early warning fetch — cada 6h ───
  register(
    'early-warning-fetch',
    '0 */6 * * *',
    fetchEarlyWarning,
    'Cada 6h — USGS earthquakes + WHO DONS + ACLED → events_store'
  );

  // ─── P2 Fase 2: Gov jobs fetch — diario 05:00 ───
  register(
    'gov-jobs-fetch',
    '0 5 * * *',
    fetchGovJobs,
    'Diario 05:00 — USAJobs + JobTechSE + hh.ru + NAV + visa cross-ref'
  );

  // ─── P2 R4 Tier A: visa sponsor repos import — semanal lunes 04:00 ───
  register(
    'visa-sponsors-import',
    '0 4 * * 1',
    fetchVisaSponsors,
    'Lunes 04:00 — SiaExplains + geshan AU + oussama NL + Canada LMIA → emp_visa_sponsors + xref'
  );

  // ─── P6 Fase 2: Traccar GPS sync — cada 5 min ───
  register(
    'traccar-gps-sync',
    '*/5 * * * *',
    syncTraccarGps,
    'Cada 5 min — Pull positions desde Traccar → log_gps_positions'
  );

  // ─── P4 Fase 3a: Schengen daily check + visa window detector ───
  register(
    'schengen-daily-check',
    '15 9 * * *',
    checkSchengenAndVisaWindows,
    'Diario 09:15 — Schengen 90/180 + alerta visa window por país'
  );

  // ─── P5 Fase 3b: Gov grants fetch — diario 06:30 ───
  register(
    'gov-grants-fetch',
    '30 6 * * *',
    fetchGovGrants,
    'Diario 06:30 — BOE ayudas + CDTI + ENISA → opportunities'
  );

  // ─── P1 Fase 3b: NLP processing — DISABLED ───
  // Superseded by B8 nlp-enrich-backfill (transformers sidecar).
  // Legacy AFINN/TextRank was lower quality and conflicted with the
  // mirror write from nlp_enrich.js to rss_articles.
  // register(
  //   'nlp-process',
  //   '20 * * * *',
  //   runNlpProcess,
  //   'Cada hora :20 — AFINN sentiment + TextRank summary para articles sin procesar'
  // );

  // ─── P4 Fase 3c: Paperless OCR sync — cada 6h ───
  register(
    'paperless-ocr-sync',
    '40 */6 * * *',
    syncPaperlessOcr,
    'Cada 6h :40 — Sync Paperless → bur_documents + extract expiry dates → document_alerts'
  );

  // ─── P7 Fase 4: Wearable raw → bio_checks aggregation — diario 23:50 ───
  register(
    'wearable-aggregate',
    '50 23 * * *',
    aggregateWearableMetrics,
    'Diario 23:50 — Aggregate bio_wearable_raw → bio_checks daily'
  );

  // ─── P1: Noticias — Fetch RSS cada 30 min con scoring ───
  register(
    'rss-fetch',
    '*/30 * * * *',
    fetchRssFeeds,
    'Cada 30 min — Buscar noticias + scoring keywords'
  );

  // ─── P1: Auto-disable feeds rotos (>336 fallos = ~7 días) ───
  // Re-enable weekly para re-check (sitios que vuelven).
  register(
    'feed-auto-disable',
    '0 5 * * *',
    async () => {
      // Disable feeds that failed 336+ consecutive times (~7 days of 30-min cycles)
      const disabled = await db.query(
        `UPDATE rss_feeds
         SET is_active = false,
             disabled_at = NOW(),
             disable_reason = 'auto: ' || consecutive_failures || ' consecutive failures — ' || COALESCE(last_error, 'unknown')
         WHERE is_active = true
           AND consecutive_failures >= 336
         RETURNING id, name, last_error`
      );
      if (disabled.rowCount > 0) {
        const names = disabled.rows.map(r => r.name).join(', ');
        console.log(`🚫 feed-auto-disable: disabled ${disabled.rowCount} feeds: ${names}`);
        try {
          await telegram.sendAlert(`🚫 Auto-disabled ${disabled.rowCount} feeds (>7d failing):\n${names}`);
        } catch (_) {}
      }
      // Weekly re-enable: reset disabled feeds on Mondays for re-check
      const dow = new Date().getDay();
      if (dow === 1) {
        const reEnabled = await db.query(
          `UPDATE rss_feeds
           SET is_active = true, consecutive_failures = 0, last_error = NULL, disable_reason = NULL, disabled_at = NULL
           WHERE is_active = false
             AND disable_reason LIKE 'auto:%'
             AND disabled_at < NOW() - INTERVAL '6 days'
           RETURNING id, name`
        );
        if (reEnabled.rowCount > 0) {
          console.log(`♻️  feed-auto-disable: re-enabled ${reEnabled.rowCount} feeds for re-check`);
        }
      }
    },
    'Diario 05:00 — auto-disable feeds con >336 fallos consecutivos'
  );

  // ─── P1: Bluesky → Jetstream firehose (B7) ─────────────
  // El polling 'bsky-search' fue sustituido por bsky_jetstream.js,
  // un WebSocket persistente al firehose Jetstream que se arranca
  // desde server.js. Sin cron — la conexión vive durante todo el
  // uptime del engine y reconecta sola con backoff.

  // ─── P2: Empleo — Scrape webs cada 6 horas ───
  register(
    'job-scrape',
    '0 */6 * * *',
    scrapeJobSources,
    'Cada 6 horas — Buscar ofertas de empleo'
  );

  // ─── P2: ATS APIs (Greenhouse/Lever/Ashby/SR) cada 6h offset 30 ───
  register(
    'ats-fetch',
    '30 */6 * * *',
    fetchAtsJobs,
    'Cada 6h (offset 30min) — ATS APIs tracked companies'
  );

  // ─── P3: Finanzas — Budget alerts diario 09:00 ───
  register(
    'budget-alerts',
    '0 9 * * *',
    checkBudgetAlerts,
    'Diario 09:00 — Alertas de presupuesto (>80%)'
  );

  // ─── P3: FX rates diario 06:00 (Frankfurter free) ───
  register(
    'fx-fetch',
    '0 6 * * *',
    fetchFxRates,
    'Diario 06:00 — Frankfurter rates NZD→{EUR,USD,...}'
  );

  // ─── P3: Net worth snapshot diario 23:55 ───
  register(
    'nw-snapshot',
    '55 23 * * *',
    snapshotNetWorth,
    'Diario 23:55 — Snapshot net worth a fin_net_worth_snapshots'
  );

  // ─── P5: Oportunidades — Deadline + follow-up diario 09:00 ───
  register(
    'opportunity-reminders',
    '5 9 * * *',
    checkOpportunityReminders,
    'Diario 09:05 — Deadlines proximos + follow-ups'
  );

  // ─── P6: Logistica — Proximas 48h diario 08:00 ───
  register(
    'logistics-next48h',
    '0 8 * * *',
    checkLogisticsNext48h,
    'Diario 08:00 — Items en las proximas 48 horas'
  );

  // ─── P6: Weather forecast diario 06:30 (Open-Meteo free) ───
  register(
    'weather-fetch',
    '30 6 * * *',
    fetchWeatherCurrentLocation,
    'Diario 06:30 — Forecast 7d Open-Meteo en current location'
  );

  // ─── P6: DOC NZ refresh semanal lunes 04:00 ───
  register(
    'doc-nz-refresh',
    '0 4 * * 1',
    refreshDocNz,
    'Lunes 04:00 — DOC NZ campsites GeoJSON refresh'
  );

  // ─── P6: Membership renewal alerts lunes 09:30 ───
  register(
    'membership-expiry',
    '30 9 * * 1',
    checkMembershipExpiry,
    'Lunes 09:30 — Workaway/MindMyHouse/WWOOF/HelpX renewals (<60 días)'
  );
  // ─── P5: Oportunidades — Scrape freelance cada 12 horas ───
  register(
    'freelance-scrape',
    '0 */12 * * *',
    freelanceScraper.fetchAll,
    'Cada 12 horas — Buscar oportunidades freelance'
  );

  // ─── P5: Multi-source remote fetcher diario 06:00 ───
  register(
    'opp-fetch',
    '0 6 * * *',
    fetchOpportunities,
    'Diario 06:00 — RemoteOK/Remotive/Himalayas/Jobicy/HN/GitHub bounties'
  );

  // ─── P2 Tier S #1: Maritime jobs (sector del usuario, 0% pre-R6) ──
  // AllCruiseJobs sweep de 14 cruise lines vía Puppeteer, cada ~12h.
  // Complementa Workday.Wilhelmsen que ya corre en tenants-scrape.
  register(
    'maritime-jobs',
    '15 5,17 * * *',
    async () => {
      const mar = require('./maritime');
      const results = await mar.fetchAll();
      console.log('⚓ maritime:', results.map(r => `${r.source}=${r.inserted ?? r.skipped ?? r.error?.slice(0,20) ?? '?'}`).join(' '));
    },
    '05:15 + 17:15 — AllCruiseJobs sweep (14 cruise lines)'
  );


  // ─── P7: Bio-Check — Resumen semanal domingo 20:00 ───
  register(
    'bio-weekly-summary',
    '0 20 * * 0',
    sendBioWeeklySummary,
    'Domingo 20:00 — Resumen bio semanal + correlaciones'
  );

  // ─── P7: Outbreak alerts diario 08:30 (WHO/CDC/ECDC) ───
  register(
    'health-outbreak-fetch',
    '30 8 * * *',
    fetchHealthAlerts,
    'Diario 08:30 — WHO/CDC/ECDC outbreak alerts'
  );

  // ─── P7: External services health probe cada 5 min ───
  register(
    'external-health-probe',
    '*/5 * * * *',
    probeExternalHealth,
    'Cada 5 min — Probe wger/mealie/grocy/fasten'
  );

  // ─── P6 Tier A: Logistics extras (Park4Night/Freecycle/etc) semanal jueves 04:30 ──
  register(
    'logistics-extras',
    '30 4 * * 4',
    async () => {
      const le = require('./logistics_extras');
      const r = await le.fetchAll();
      console.log('🗺️ logistics-extras:', r.map(x => `${x.source}=${x.inserted ?? x.error?.slice(0,30) ?? x.skipped ?? '?'}`).join(' '));
    },
    'Jueves 04:30 — Park4Night/Freecycle/TransferCar/Imoova/eSIMDB/etc'
  );

  // ─── P6 R5: Park4Night crawl incremental cada 2h ──
  // Strategy: sitemap-based accumulation. Cada run scrape batchSize=30 places
  // via Puppeteer (3-5s/place → ~2min por batch). Cron-friendly, no bloquea.
  // Estado persiste en tabla `p4n_crawl_state`. Sitemap-1 (4168 places)
  // cubierto en ~12 días. Total 91 sitemaps → acumulación continua.
  register(
    'park4night-crawl',
    '0 */2 * * *',
    async () => {
      const le = require('./logistics_extras');
      try {
        const r = await le.fetchPark4Night({ batchSize: 100 });
        if (r.error || r.skipped) {
          console.log(`🏕️ p4n crawl: ${r.error || r.skipped}`);
        } else {
          console.log(`🏕️ p4n crawl: sitemap=${r.sitemap} range=[${r.batch_range.join(',')}] inserted=${r.inserted}/${r.scanned} total_known=${r.total_known}`);
        }
      } catch (err) { console.error('park4night-crawl err:', err.message); }
    },
    'Cada 2h — Park4Night sitemap crawl (100/batch via Puppeteer, ~7.5min/run)'
  );

  // ─── P6 R4 Tier A: Overpass essentials POIs — mensual día 1 a las 03:00 ──
  // Fetch fuel/water/showers/toilets/laundry/picnic_site para país base.
  // Cron mensual porque OSM cambia poco y Overpass público tiene rate limits estrictos.
  register(
    'overpass-essentials',
    '0 3 1 * *',
    async () => {
      const le = require('./logistics_extras');
      try {
        const r = await le.fetchOverpassEssentials({ country: 'NZ' });
        console.log(`🗺️ overpass-essentials: ${r.fetched} fetched, ${r.inserted} inserted`);
      } catch (err) { console.error('overpass-essentials err:', err.message); }
    },
    'Día 1 a las 03:00 — fuel/water/showers/toilets/laundry/picnic via Overpass NZ'
  );

  // ─── P7 Tier A: Bio extras pollers cada 6h ──
  register(
    'bio-extras-poll',
    '0 */6 * * *',
    async () => {
      const bx = require('./bio_extras');
      const results = [];
      for (const fn of [bx.fetchOpenUV, bx.fetchFitbitDaily, bx.fetchOuraDaily, bx.fetchWithingsDaily]) {
        try { results.push(await fn()); } catch (e) { results.push({ error: e.message }); }
      }
      console.log('🩺 bio-extras:', results.map(r => `${r.source || '?'}=${r.skipped ? 'skip' : (r.error ? 'err' : 'ok')}`).join(' '));
    },
    'Cada 6h — OpenUV/Fitbit/Oura/Withings (skipped si no hay credenciales)'
  );

  // ─── P7 Tier A: wger workout sessions → bio_journal cada 6h ──
  register(
    'wger-workouts-sync',
    '20 */6 * * *',
    async () => {
      try {
        const wger = require('./wger');
        const r = await wger.syncWorkoutSessions({ limit: 50 });
        if (r.skipped) console.log('💪 wger-workouts-sync skip:', r.skipped);
        else if (r.error) console.warn('💪 wger-workouts-sync err:', r.error);
        else if (r.inserted > 0) console.log(`💪 wger-workouts-sync: ${r.inserted} new sessions → bio_journal (${r.skipped} dup, ${r.total} total)`);
      } catch (err) { console.error('❌ wger-workouts-sync:', err.message); }
    },
    'Cada 6h :20 — Sync wger workoutsession → bio_journal (requires WGER_API_TOKEN)'
  );

  // ─── P1 WM Phase 2: clustering rss_articles → wm_clusters cada hora :30 ──
  register(
    'wm-cluster-news',
    '30 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runClusteringJob({ lookbackHours: 24, limit: 1000 });
        console.log(`🧠 wm-cluster-news: scanned=${r.articlesScanned} clusters=${r.clustersFound} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-cluster-news:', err.message); }
    },
    'Cada hora :30 — Cluster últimas 24h de rss_articles vía worldmonitor/services/clustering.ts → wm_clusters'
  );

  // ─── P1 WM Phase 2 step 2: focal-point detector → wm_focal_points cada hora :40 ──
  register(
    'wm-focal-points',
    '40 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runFocalPointJob({ lookbackHours: 24, limit: 1000 });
        console.log(`🎯 wm-focal-points: scanned=${r.articlesScanned} clusters=${r.clustersUsed} fps=${r.focalPoints} crit=${r.criticalCount} elev=${r.elevatedCount} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-focal-points:', err.message); }
    },
    'Cada hora :40 — Focal-point detector sobre clusters de las últimas 24h vía worldmonitor/services/focal-point-detector.ts → wm_focal_points'
  );

  // ─── P1 WM Phase 2 step 3: country instability → wm_country_scores cada hora :50 ──
  register(
    'wm-country-scores',
    '50 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runCountryInstabilityJob({ lookbackHours: 24, limit: 1000 });
        const lvl = r.byLevel;
        console.log(`🌍 wm-country-scores: scanned=${r.articlesScanned} clusters=${r.clustersUsed} countries=${r.countriesScored} crit=${lvl.critical} high=${lvl.high} elev=${lvl.elevated} norm=${lvl.normal} low=${lvl.low} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-country-scores:', err.message); }
    },
    'Cada hora :50 — Country instability scoring sobre clusters de las últimas 24h vía worldmonitor/services/country-instability.ts → wm_country_scores'
  );

  // ─── P1 WM Phase 2 step 4: trending keywords → wm_trending_keywords cada hora :55 ──
  register(
    'wm-trending-keywords',
    '55 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runTrendingKeywordsJob({ lookbackHours: 24, limit: 1000 });
        console.log(`🔥 wm-trending-keywords: scanned=${r.articlesScanned} tracked=${r.trackedTerms} signals=${r.signalsEmitted} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-trending-keywords:', err.message); }
    },
    'Cada hora :55 — Trending keyword spike detection sobre artículos de las últimas 24h vía worldmonitor/services/trending-keywords.ts → wm_trending_keywords'
  );

  // ─── P1 WM Phase 2 step 5: military flights → wm_military_flights cada 5 min ──
  // Uses OpenSky Network OAuth2 client_credentials direct path. 4 hotspot
  // bbox queries per run (INDO-PACIFIC, CENTCOM, EUCOM, ARCTIC). Cleanup
  // of rows older than MILITARY_FLIGHTS_RETENTION_DAYS (default 30) is run
  // at the end of every cycle.
  register(
    'wm-military-flights',
    '*/5 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runMilitaryFlightsJob();
        const ops = Object.entries(r.byOperator)
          .filter(([k]) => k !== 'other')
          .sort((a,b) => b[1] - a[1])
          .slice(0, 6)
          .map(([k,v]) => `${k}=${v}`)
          .join(' ');
        console.log(`✈️  wm-military-flights: fetched=${r.flightsFetched} clusters=${r.clustersFound} inserted=${r.inserted} deleted=${r.deleted} [${ops}] ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-military-flights:', err.message); }
    },
    'Cada 5 min — Military flight tracking via OpenSky direct OAuth2 sobre 4 hotspots → wm_military_flights'
  );

  // ─── P1 WM Phase 2 step 6: USNI Fleet Tracker → wm_usni_fleet diario 06:30 ──
  // USNI publica un fleet tracker semanal. Daily scrape como safety net:
  // si el cron del miércoles falla, el del jueves recoge. Idempotente
  // por article_url, así que múltiples runs sobre el mismo article son
  // UPDATE no INSERT.
  register(
    'wm-usni-fleet',
    '30 6 * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runUSNIFleetJob();
        console.log(`⚓ wm-usni-fleet: ${r.articleDate || 'unknown'} vessels=${r.vesselCount} regions=${r.regionCount} battle=${r.totalBattleForce} deployed=${r.deployed} underway=${r.underway} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-usni-fleet:', err.message); }
    },
    'Diario 06:30 — USNI Fleet Tracker scraping vía puppeteer → wm_usni_fleet'
  );

  // ─── P1 WM Phase 2 step 7: military vessels snapshot → wm_military_vessels cada 5 min ──
  // Reads the in-memory tracked vessels Map maintained by the
  // aisstream_subscriber.js (started at engine boot in server.js) via
  // processAisPosition() in military-vessels.ts. Snapshot is persisted
  // as one row per (mmsi, observed_at), historical pattern. Cleanup of
  // rows older than MILITARY_VESSELS_RETENTION_DAYS at end of cycle.
  register(
    'wm-military-vessels',
    '*/5 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runMilitaryVesselsJob();
        const ops = Object.entries(r.byOperator)
          .filter(([k]) => k !== 'other')
          .sort((a,b) => b[1] - a[1])
          .slice(0, 6)
          .map(([k,v]) => `${k}=${v}`)
          .join(' ');
        const cps = Object.entries(r.byChokepoint)
          .sort((a,b) => b[1] - a[1])
          .slice(0, 4)
          .map(([k,v]) => `${k}=${v}`)
          .join(' ');
        console.log(`🚢 wm-military-vessels: tracked=${r.tracked} inserted=${r.inserted} deleted=${r.deleted} [${ops || 'no-confirmed-ops'}] {${cps || 'no-chokepoints'}} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-military-vessels:', err.message); }
    },
    'Cada 5 min — Snapshot del Map in-memory de military vessels mantenido por aisstream_subscriber → wm_military_vessels'
  );

  // ─── P1 WM Phase 2 step 9: natural events (NASA EONET + GDACS) → wm_natural_events cada 30 min ──
  // EONET and GDACS are non-realtime feeds (refresh ~hours). 30min cadence
  // is more than fast enough. fetchNaturalEvents() merges both sources
  // internally; idempotent upsert by (source, event_id).
  register(
    'wm-natural-events',
    '7,37 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runNaturalEventsJob({ days: 30 });
        console.log(`🌪️  wm-natural-events: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} deleted=${r.deleted} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-natural-events:', err.message); }
    },
    'Cada 30 min (HH:07, HH:37) — NASA EONET + GDACS direct fetch → wm_natural_events'
  );

  // ─── P1 WM Phase 2 step 10: USGS earthquakes → wm_earthquakes cada 10 min ──
  // USGS feed updates ~1-2 min after a quake. 10 min cron catches every
  // significant quake (M>=4.5) within ~10 min of occurrence. Idempotent
  // upsert by usgs_id; re-fetching the same quake refreshes felt/cdi/mmi
  // counts as DYFI reports come in.
  register(
    'wm-earthquakes',
    '*/10 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runEarthquakesJob({ minMagnitude: '4.5', period: 'day' });
        console.log(`🌍 wm-earthquakes: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} deleted=${r.deleted} maxMag=${r.maxMag.toFixed(1)} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-earthquakes:', err.message); }
    },
    'Cada 10 min — USGS GeoJSON M>=4.5 last day direct fetch → wm_earthquakes'
  );

  // ─── P1 WM Phase 2 step 11: NASA FIRMS satellite fires → wm_satellite_fires cada 30 min ──
  // VIIRS_SNPP_NRT global fire detections, last 24h window. ~20K-50K
  // detections per day → ~500K-1.5M rows/mes. Retention 14 días bounded.
  // Composite UNIQUE prevents duplicate inserts of the same satellite pass.
  register(
    'wm-satellite-fires',
    '12,42 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runSatelliteFiresJob({ source: 'VIIRS_SNPP_NRT', area: '-180,-90,180,90', dayRange: 1 });
        console.log(`🔥 wm-satellite-fires: fetched=${r.fetched} inserted=${r.inserted} deleted=${r.deleted} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-satellite-fires:', err.message); }
    },
    'Cada 30 min (HH:12, HH:42) — NASA FIRMS VIIRS NRT direct fetch global → wm_satellite_fires'
  );

  // ─── P1 WM Phase 2 step 8: signal-aggregator → wm_signal_summary cada 5 min (offset +1) ──
  // Combines military flights, vessels, satellite fires (FIRMS), and
  // earthquake spikes (USGS) into a single SignalSummary that downstream
  // services consume. Activates focal-point urgencies elevated/critical
  // and CII security component. Offset +1 min vs flights/vessels (which
  // fire at *\/5 :00) so the aggregator always reads fresh data.
  register(
    'wm-signal-aggregator',
    '1-59/5 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runSignalAggregatorJob();
        const types = Object.entries(r.byType || {})
          .filter(([, v]) => v > 0)
          .map(([k,v]) => `${k}=${v}`)
          .join(' ');
        console.log(`📡 wm-signal-aggregator: flights=${r.flights} vessels=${r.vessels} fires=${r.fires} quakes=${r.quakeAnomalies} signals=${r.totalSignals} [${types || 'none'}] countries=${r.topCountriesCount} convergence=${r.convergenceZonesCount} inserted=${r.inserted} deleted=${r.deleted} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-signal-aggregator:', err.message); }
    },
    'Cada 5 min :01 — Signal aggregator combina flights+vessels+fires+quakes → singleton signalAggregator → wm_signal_summary'
  );

  // ─── P1 WM Phase 2 step 12: gdelt-intel multi-topic → wm_intel_articles ──
  // Reemplaza el cron legacy `gdelt-fetch` (news_apis.fetchGdelt) que
  // alternaba entre HTTP 429 y timeout. 24 topic queries cubriendo el
  // espectro completo de GDELT DOC 2.0:
  //   military, cyber, nuclear, sanctions, intelligence, maritime,
  //   economy, climate, protests, terrorism, migration, energy,
  //   health, technology, space, elections, diplomacy, trade, finance,
  //   disasters, human_rights, food_security, water, ai_policy
  //
  // Split en 6 grupos de 4 topics cada 10 min (HH:02/12/22/32/42/52).
  // 12s stagger + 2 attempts (20s/60s backoff) + 15s timeout → cada run
  // ~50-90s en buen día. GDELT recibe ~9 min entre grupos para recover.
  // Cobertura total: los 24 topics cada hora.
  // Smoke (2026-04-08): grupos de 8 topics dieron 6/8 errors GDELT 429
  // → reducidos a 4 topics × 6 grupos para distribuir mejor la carga.
  // Cleanup retention 7d corre solo en grupo F (último del ciclo).
  const wmGdeltGroupHandler = (group) => async () => {
    try {
      const wm = require('./wm_bridge');
      const r = await wm.runWmGdeltIntelJob({ group });
      const errs = r.errors ? ` errs=[${r.errors}]` : '';
      console.log(`🌐 wm-gdelt-intel-${group}: topics=${r.topicsOk}/${r.topicsTotal} (empty=${r.topicsEmpty} err=${r.topicsErr}) fetched=${r.articlesFetched} inserted=${r.inserted} updated=${r.updated} deleted=${r.deleted}${errs} ${r.durationMs}ms`);
    } catch (err) { console.error(`❌ wm-gdelt-intel-${group}:`, err.message); }
  };
  register('wm-gdelt-intel-a', '2 * * * *',  wmGdeltGroupHandler('a'), 'HH:02 — GDELT A (military, cyber, nuclear, sanctions)');
  register('wm-gdelt-intel-b', '12 * * * *', wmGdeltGroupHandler('b'), 'HH:12 — GDELT B (intelligence, maritime, economy, climate)');
  register('wm-gdelt-intel-c', '22 * * * *', wmGdeltGroupHandler('c'), 'HH:22 — GDELT C (protests, terrorism, migration, energy)');
  register('wm-gdelt-intel-d', '32 * * * *', wmGdeltGroupHandler('d'), 'HH:32 — GDELT D (health, technology, space, elections)');
  register('wm-gdelt-intel-e', '42 * * * *', wmGdeltGroupHandler('e'), 'HH:42 — GDELT E (diplomacy, trade, finance, disasters)');
  register('wm-gdelt-intel-f', '52 * * * *', wmGdeltGroupHandler('f'), 'HH:52 — GDELT F (human_rights, food_security, water, ai_policy) + retention cleanup');

  // ─── P1 finalization B4 — GDELT GEO timelines + z-score alerts ──
  // 28 países hotspot, paced por gdelt_throttle (~8-10s/req global).
  // Cron cada 6h en :55 (no :22) para no arrancar encima de
  // wm-gdelt-intel-c (HH:22). El throttle compartido coordinaría
  // igualmente, pero arrancar en una ventana donde intel está idle
  // reduce el coste inicial de cooldown.
  // Persiste daily snapshot en wm_gdelt_geo_timeline + INSERT a
  // wm_gdelt_volume_alerts cuando z-score >= 2.0 vs baseline 28d.
  // Publish 'gdelt.spike' en eventbus para downstream handlers.
  register(
    'wm-gdelt-geo',
    '55 0,6,12,18 * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runWmGdeltGeoJob();
        console.log(`🌍 wm-gdelt-geo: countries=${r.countriesProcessed} persisted=${r.rowsPersisted} alerts=${r.alertsTriggered} ${r.elapsedSec}s`);
      } catch (err) { console.error('❌ wm-gdelt-geo:', err.message); }
    },
    'Cada 6h :55 — GDELT GEO timelines + volume z-score alerts (28 hotspots)'
  );

  // ─── DEPTH-6: GDELT GEO Tier B — expanded countries every 12h ──
  register(
    'wm-gdelt-geo-expanded',
    '55 3,15 * * *',
    async () => {
      try {
        const { runOnce, EXPANDED_COUNTRIES } = require('./wm_gdelt_geo');
        const r = await runOnce({ countries: EXPANDED_COUNTRIES });
        console.log(`🌍 wm-gdelt-geo-expanded: countries=${r.countries} persisted=${r.persisted} alerts=${r.alerts} ${r.elapsedSec}s`);
      } catch (err) { console.error('❌ wm-gdelt-geo-expanded:', err.message); }
    },
    'Cada 12h 03:55/15:55 — GDELT GEO timelines Tier B (~70 extra countries)'
  );

  // ─── P1 WM Phase 2 step 13: hotspot dynamic escalation ──
  // Calcula score 1.0–5.0 para los 27 INTEL_HOTSPOTS combinando
  // newsActivity (wm_clusters keyword match), CII (wm_country_scores),
  // geoConvergence (wm_signal_summary) y militaryActivity (proximidad
  // wm_military_flights+vessels). Solo SQL local — sin llamadas externas.
  register(
    'wm-hotspot-escalation',
    '8,23,38,53 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runWmHotspotEscalationJob();
        console.log(`🎯 wm-hotspot-escalation: ${r.hotspotsProcessed} hotspots (ins=${r.inserted} upd=${r.updated}) escalating=${r.escalating} critical≥4.0=${r.critical} ${r.durationMs}ms`);
      } catch (err) { console.error('❌ wm-hotspot-escalation:', err.message); }
    },
    'Cada 15 min :08 — Hotspot dynamic escalation → wm_hotspot_escalation'
  );

  // ─── WM Phase 3 Bloque 1 step 14: market quotes (Yahoo v8 chart) ──
  // ~46 symbols del catálogo (12 sectors + 6 commodities + 28 stocks +
  // major indices + ^VIX). Yahoo v8 chart endpoint, no auth, ~5-7s wall
  // clock. Snapshot append-only en wm_market_quotes. Solo durante NY
  // market hours (UTC 13:30-21:00 ≈ 9:30-16:00 ET, lun-vie). Cleanup
  // retention 90 días en el primer tick de cada hora.
  register(
    'wm-market-quotes',
    '*/15 13-21 * * 1-5',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runMarketQuotesJob();
        if (r.error) {
          console.error(`❌ wm-market-quotes: ${r.error}`);
        } else {
          console.log(`📈 wm-market-quotes: fetched=${r.fetched} inserted=${r.inserted} deleted=${r.deleted} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-market-quotes:', err.message); }
    },
    'Cada 15 min UTC 13-21 lun-vie — Yahoo v8 chart snapshots → wm_market_quotes'
  );

  // ─── WM Phase 3 Bloque 1 step 15: crypto quotes (CoinGecko) ──
  // BTC / ETH / SOL / XRP + global market cap + BTC dominance vía
  // CoinGecko public API (sin auth, 2 calls por tick). Snapshot
  // append-only en wm_crypto_quotes. 24/7 cada 5 min. Cleanup retention
  // 90 días una vez por hora.
  register(
    'wm-crypto-quotes',
    '*/5 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runCryptoQuotesJob();
        if (r.error) {
          console.error(`❌ wm-crypto-quotes: ${r.error}`);
        } else {
          console.log(`🪙 wm-crypto-quotes: fetched=${r.fetched} inserted=${r.inserted} deleted=${r.deleted} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-crypto-quotes:', err.message); }
    },
    'Cada 5 min 24/7 — CoinGecko top4 + global → wm_crypto_quotes'
  );

  // ─── WM Phase 3 Bloque 2 step 16: energy inventories (EIA) ──
  // 4 weekly U.S. inventory series (crude/gasoline/distillate/natgas)
  // via EIA v2 seriesid. UPSERT por (series_id, period) → re-runs son
  // no-ops si EIA no ha publicado todavía. Cron diario 21:00 UTC
  // (~17:00 ET) para captar tanto la publicación de petróleo (mié)
  // como la de gas natural (jue) sin lógica de día semana.
  register(
    'wm-energy-inventories',
    '0 21 * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runEnergyInventoriesJob();
        if (r.error) {
          console.error(`❌ wm-energy-inventories: ${r.error}`);
        } else {
          console.log(`🛢️  wm-energy-inventories: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-energy-inventories:', err.message); }
    },
    'Diario 21:00 UTC — EIA crude/gasoline/distillate/natgas → wm_energy_inventories'
  );

  // ─── WM Phase 3 Bloque 2 step 17: FX rates (Frankfurter) ──
  // 18 majors USD-base via Frankfurter (ECB ref rates). UPSERT por
  // (base, quote, rate_date). ECB publica ~16:00 CET en días
  // hábiles; cron 06:00 UTC siguiente día garantiza que ya está.
  // Retention 730 días via cleanupOldFxRates en cada tick.
  register(
    'wm-fx-rates',
    '0 6 * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runFxRatesJob();
        if (r.error) {
          console.error(`❌ wm-fx-rates: ${r.error}`);
        } else {
          console.log(`💱 wm-fx-rates: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} deleted=${r.deleted} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-fx-rates:', err.message); }
    },
    'Diario 06:00 UTC — Frankfurter ECB ref rates 18 majors → wm_fx_rates'
  );

  // ─── WM Phase 3 Bloque 3 step 18: macro indicators (FRED + WB) ──
  // 12 series FRED (rates / yield curve / inflation / liquidity /
  // recession / credit) + 2 indicadores anuales World Bank (GDP growth
  // y unemployment a nivel WLD). NOTA 2026-04-08: WB no publica
  // FP.CPI.TOTL.ZG para WLD (verificado vacío); inflación mundial se
  // cubre vía FRED CPIAUCSL. UPSERT por (source, indicator_id, area,
  // period). Cada 6h captura ticks daily de FRED sin sobrecargar el endpoint.
  register(
    'wm-macro-indicators',
    '0 */6 * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runMacroIndicatorsJob();
        if (r.error) {
          console.error(`❌ wm-macro-indicators: ${r.error}`);
        } else {
          console.log(`📊 wm-macro-indicators: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-macro-indicators:', err.message); }
    },
    'Cada 6h — FRED 12 series + World Bank 2 series → wm_macro_indicators'
  );

  // ─── WM Phase 3 Bloque 3 step 19: agri commodities (USDA NASS) ──
  // 5 anchor crops US NATIONAL annual production (CORN/SOYBEANS/
  // WHEAT/COTTON/RICE) via Quick Stats API. UPSERT por (commodity,
  // metric, area, period). USDA publica estimaciones anuales unas
  // pocas veces al año — semanal lun 10:00 UTC es no-op casi siempre.
  register(
    'wm-agri-commodities',
    '0 10 * * 1',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runAgriCommoditiesJob();
        if (r.error) {
          console.error(`❌ wm-agri-commodities: ${r.error}`);
        } else {
          console.log(`🌾 wm-agri-commodities: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-agri-commodities:', err.message); }
    },
    'Semanal lun 10:00 UTC — USDA NASS Quick Stats 5 crops → wm_agri_commodities'
  );

  // ─── WM Phase 3 Bloque 4 Sub-a: Manifold prediction markets ──
  // Manifold Markets via /v0/search-markets, 9 normalized categories
  // (politics/geopolitics/elections/macro/ai/science/biosec/crypto/tech)
  // × ~5 search terms each. Public REST API, no auth, no Cloudflare,
  // 500 req/min cap (we use ~6 req/s). UPSERT por (source, source_market_id);
  // each tick also appends a snapshot row to wm_prediction_market_snapshots.
  // Currency is MANA (Manifold play-money), stored in `currency` column.
  register(
    'wm-manifold-markets',
    '*/30 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runManifoldMarketsJob();
        if (r.error) {
          console.error(`❌ wm-manifold-markets: ${r.error}`);
        } else {
          console.log(`📈 wm-manifold-markets: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} snapshotted=${r.snapshotted} skipped=${r.skipped} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-manifold-markets:', err.message); }
    },
    'Cada 30min — Manifold Markets /v0/search-markets → wm_prediction_markets'
  );

  // ─── WM Phase 3 Bloque 4 Sub-b: Kalshi prediction markets ──
  // Kalshi (CFTC-regulated US prediction exchange) via /v2/events
  // ?status=open&with_nested_markets=true. Category whitelist filters
  // out Sports/Entertainment/Mentions noise; keeps Politics/Elections/
  // Economics/Financials/World/Climate/SciTech/Crypto/Health/Companies.
  // USD-denominated, no auth, ~10-30 paginated calls per tick.
  register(
    'wm-kalshi-markets',
    '*/15 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runKalshiMarketsJob();
        if (r.error) {
          console.error(`❌ wm-kalshi-markets: ${r.error}`);
        } else {
          console.log(`🇺🇸 wm-kalshi-markets: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} snapshotted=${r.snapshotted} skipped=${r.skipped} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-kalshi-markets:', err.message); }
    },
    'Cada 15min — Kalshi /v2/events open + nested markets → wm_prediction_markets'
  );

  // ─── WM Phase 3 Bloque 4 Sub-d: Polymarket prediction markets ──
  // Polymarket (USDC-settled on-chain prediction market on Polygon) via
  // Gamma API /events?closed=false&order=volume&ascending=false. Top
  // 2000 events by volume (10 pages × 200), event-tag whitelist drops
  // Sports/Culture/operational tags, per-market activity filter requires
  // 24h volume>0 OR liquidity>1000 USD. USD-denominated, no auth.
  // Note: an older RPC (domains/prediction/v1/list-prediction-markets.ts)
  // documented Cloudflare JA3 fingerprint blocking — verified 2026-04-09
  // that this is no longer in effect from this Hetzner box.
  register(
    'wm-polymarket-markets',
    '*/15 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runPolymarketMarketsJob();
        if (r.error) {
          console.error(`❌ wm-polymarket-markets: ${r.error}`);
        } else {
          console.log(`💰 wm-polymarket-markets: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} snapshotted=${r.snapshotted} skipped=${r.skipped} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-polymarket-markets:', err.message); }
    },
    'Cada 15min — Polymarket Gamma /events open + nested markets → wm_prediction_markets'
  );

  // ─── Prediction market snapshots retention (48h) ──────────────────
  // Daily digest needs 26h, correlation needs 2h. 48h gives safe margin.
  // ~1.7M rows/day ≈ 450 MB/day unchecked. Runs daily at 04:15.
  register(
    'pred-snapshots-retention',
    '15 4 * * *',
    async () => {
      const { rowCount } = await db.query(
        `DELETE FROM wm_prediction_market_snapshots WHERE captured_at < NOW() - INTERVAL '48 hours'`
      );
      console.log(`🗑️  pred-snapshots-retention: purged ${rowCount} rows`);
    },
    'Diario 04:15 — purge prediction market snapshots >48h'
  );

  // ─── WM Phase 3 Bloque 5 Sub-A: cyber CVEs (NIST NVD + CISA KEV) ──
  // Pull NVD CVEs published in the last 30d (cvss ≥ 7.0) merged with
  // the full CISA KEV catalog. UPSERT por cve_id; NVD anon rate limit
  // is 5 req/30s so a 6.5s pause between pages keeps us under it. Cron
  // hourly — NVD publishes in irregular bursts and there's no value to
  // higher frequency. Cleanup retention 365d (KEV-tagged rows kept
  // indefinitely).
  register(
    'wm-cyber-cves',
    '7 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runCyberCvesJob();
        if (r.error) {
          console.error(`❌ wm-cyber-cves: ${r.error}`);
        } else {
          console.log(`🛡️  wm-cyber-cves: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} deleted=${r.deleted} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-cyber-cves:', err.message); }
    },
    'Cada hora :07 — NIST NVD 2.0 + CISA KEV catalog → wm_cyber_cves'
  );

  // ─── WM Phase 3 Bloque 5 Sub-B: Cloudflare Radar outages ──
  // GET /radar/annotations/outages?dateRange=30d con bearer
  // CLOUDFLARE_RADAR_TOKEN. UPSERT por annotation id; ongoing
  // outages se actualizan cuando CF cierra el end_date. Cada 30 min
  // — Cloudflare publica updates ~horarios.
  register(
    'wm-cf-radar-outages',
    '*/30 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runCloudflareRadarOutagesJob();
        if (r.error) {
          console.error(`❌ wm-cf-radar-outages: ${r.error}`);
        } else {
          console.log(`🌐 wm-cf-radar-outages: fetched=${r.fetched} inserted=${r.inserted} updated=${r.updated} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-cf-radar-outages:', err.message); }
    },
    'Cada 30min — Cloudflare Radar /annotations/outages 30d window → wm_internet_outages'
  );

  // ─── WM Phase 3 Bloque 5 Sub-D: commercial flights (OpenSky) ──
  // OpenSky /api/states/all sobre 6 bboxes comerciales (NA / EU /
  // APAC / MENA), filtra military out (ya en wm_military_flights),
  // sample MAX 600/región para acotar volumen. Append-only snapshot
  // por (icao24, observed_at). Retention 7d en el primer tick de cada
  // hora. Cron */15 (igual cadencia que market-quotes).
  register(
    'wm-commercial-flights',
    '*/15 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runCommercialFlightsJob();
        if (r.error) {
          console.error(`❌ wm-commercial-flights: ${r.error}`);
        } else {
          console.log(`✈️  wm-commercial-flights: fetched=${r.fetched} inserted=${r.inserted} deleted=${r.deleted} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-commercial-flights:', err.message); }
    },
    'Cada 15min — OpenSky non-military 6 regions → wm_commercial_flights'
  );

  // ─── WM Phase 3 Bloque 5 Sub-D: commercial vessels (AISStream) ──
  // El subscriber WebSocket fan-outs cada AIS message a
  // commercial-vessels.processCommercialAisPosition (cargo/tanker
  // ship type 70-89) que mantiene un Map en memoria. Este job
  // snapshota el Map cada 15 min al wm_commercial_vessels. Retention
  // 7d.
  register(
    'wm-commercial-vessels',
    '3-59/15 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runCommercialVesselsJob();
        if (r.error) {
          console.error(`❌ wm-commercial-vessels: ${r.error}`);
        } else {
          const cats = Object.entries(r.byCategory || {}).map(([k, v]) => `${k}=${v}`).join(' ');
          console.log(`🚢 wm-commercial-vessels: tracked=${r.tracked} inserted=${r.inserted} deleted=${r.deleted} ${cats} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-commercial-vessels:', err.message); }
    },
    'Cada 15min :3 — AISStream cargo/tanker snapshot → wm_commercial_vessels'
  );

  // ─── WM Phase 3 Bloque 5: correlation runner (Phase 2 closure) ──
  // Server-side detectors over PG state: market_move / crypto_move /
  // fx_move / prediction_swing / cve_critical / outage_started.
  // Dedup por (signal_type, entity_key) en ventana 6-168h según tipo.
  // Append-only a wm_correlation_signals. Retention 90 días.
  register(
    'wm-correlation',
    '11-59/15 * * * *',
    async () => {
      try {
        const wm = require('./wm_bridge');
        const r = await wm.runCorrelationJob();
        if (r.error) {
          console.error(`❌ wm-correlation: ${r.error}`);
        } else {
          console.log(`🔗 wm-correlation: emitted=${r.emitted} skipped=${r.skippedDup} mm=${r.marketMoves} cm=${r.cryptoMoves} fx=${r.fxMoves} pred=${r.predictionSwings} cve=${r.cveCriticals} out=${r.newOutages} deleted=${r.deleted} ${r.durationMs}ms`);
        }
      } catch (err) { console.error('❌ wm-correlation:', err.message); }
    },
    'Cada 15min :11 — Server-side correlation detectors → wm_correlation_signals'
  );

  // ─── P1 Tier A: News API stubs poll cada 4h ──
  register(
    'news-api-stubs',
    '15 */4 * * *',
    async () => {
      const na = require('./news_apis');
      const results = [];
      for (const fn of [na.fetchCurrents, na.fetchNewsdata, na.fetchFinlight, na.fetchEventRegistry, na.fetchYouTubeSearch, na.fetchMastodonSearch, na.fetchApplePodcasts, na.fetchPodcastIndex]) {
        try { results.push(await fn()); } catch (e) { results.push({ error: e.message }); }
      }
      console.log('📰 news-api-stubs:', results.map(r => r.skipped ? 'skip' : (r.error ? 'err' : `+${r.newCount || 0}`)).join(' '));
    },
    'Cada 4h+15min — Currents/Newsdata/Finlight/EventRegistry/YouTube/Mastodon/ApplePodcasts/PodcastIndex'
  );

  // ─── Health check — Cada hora ───
  register(
    'health-ping',
    '0 * * * *',
    healthPing,
    'Cada hora — Health check interno'
  );

  // ─── P1 P0 #2 — Feeds health check ──────────────────────
  // Audita los 750+ feeds RSS cada 6h. Solo notifica Telegram
  // si problems >= 5 o hay feeds stale > 72h. Silencioso bajo
  // ese umbral para evitar ruido.
  register(
    'feeds-health-check',
    '17 */6 * * *',
    async () => {
      try {
        const { runFeedsHealthCheck } = require('./feeds_health');
        const r = await runFeedsHealthCheck();
        if (r.alerted) {
          console.log(`🩺 feeds-health alerted: ${r.never} never + ${r.stale24} stale_24h + ${r.stale72} stale_72h`);
        }
      } catch (err) {
        console.error('❌ feeds-health-check:', err.message);
      }
    },
    'Cada 6h :17 — Audit RSS feeds health (silent unless degraded)'
  );

  // ─── P1 B8 — NLP enrichment backfill ──────
  // Every 10 min: score≥3, no time window, 500/batch, parallel concurrency 6
  // Catches up the full backlog then stays current
  register(
    'nlp-enrich-backfill',
    '*/10 * * * *',
    async () => {
      try {
        const nlpEnrich = require('./nlp_enrich');
        const r = await nlpEnrich.enrichBackfill({ minScore: 3, limit: 500, sinceHours: 0 });
        if (r.candidates > 0) {
          console.log(`🧠 nlp-backfill: ${r.enriched}/${r.candidates} enriched (pending queue: ${r.stats.waiting}, dropped: ${r.stats.dropped})`);
        }
      } catch (err) {
        console.error('❌ nlp-enrich-backfill:', err.message);
      }
    },
    'Cada 10 min — NLP backfill score≥3, no time limit, 500/batch parallel'
  );

  // ─── DEPTH-1: Semantic event clustering — every 15 min ───
  register(
    'depth-cluster',
    '*/15 * * * *',
    async () => {
      try {
        const { clusterArticles } = require('./depth_analysis');
        const r = await clusterArticles();
        if (r.clustered > 0) {
          console.log(`🔗 cluster: ${r.clustered} articles (${r.newClusters} new clusters, ${r.totalActive} active)`);
        }
      } catch (err) {
        console.error('❌ depth-cluster:', err.message);
      }
    },
    'Cada 15 min — Semantic event clustering via embeddings'
  );

  // ─── DEPTH-2: Event extraction — every 30 min ───
  register(
    'depth-events',
    '5,35 * * * *',
    async () => {
      try {
        const { extractEvents } = require('./depth_analysis');
        const r = await extractEvents();
        if (r.extracted > 0) {
          console.log(`📋 events: ${r.extracted} structured events extracted`);
        }
      } catch (err) {
        console.error('❌ depth-events:', err.message);
      }
    },
    'Cada 30 min — Structured event extraction (WHO/WHAT/WHERE/WHEN)'
  );

  // ─── DEPTH-3: Daily digest — 08:00 NZT ───
  register(
    'daily-digest',
    '0 8 * * *',
    async () => {
      try {
        const { generateDigest } = require('./daily_digest');
        const r = await generateDigest();
        console.log(`📨 digest sent: ${r.sections} sections, ${r.length} chars`);
      } catch (err) {
        console.error('❌ daily-digest:', err.message);
      }
    },
    'Diario 08:00 NZT — Telegram intelligence digest'
  );

  // ─── DEPTH-4: Topic trend detection — every hour ───
  register(
    'depth-trends',
    '10 * * * *',
    async () => {
      try {
        const { detectTrends } = require('./depth_analysis');
        const r = await detectTrends();
        if (r.spikes > 0) {
          console.log(`📈 trends: ${r.spikes} spikes detected (${r.total} topics tracked)`);
        }
      } catch (err) {
        console.error('❌ depth-trends:', err.message);
      }
    },
    'Cada hora :10 — Topic trend velocity + spike detection'
  );

  // ─── DEPTH-5: Country sentiment aggregation — every 2h ───
  register(
    'depth-sentiment',
    '25 */2 * * *',
    async () => {
      try {
        const { aggregateCountrySentiment } = require('./depth_analysis');
        const r = await aggregateCountrySentiment();
        if (r.countries > 0) {
          console.log(`🌡️ sentiment: ${r.countries} countries aggregated`);
        }
      } catch (err) {
        console.error('❌ depth-sentiment:', err.message);
      }
    },
    'Cada 2h :25 — Country sentiment aggregation'
  );

  console.log(`✅ ${jobs.length} jobs registrados`);
}

/**
 * Registra un cron job
 */
function register(name, schedule, handler, description) {
  const tz = process.env.TZ || 'UTC';
  const job = cron.schedule(schedule, async () => {
    const start = Date.now();
    console.log(`🔄 [${name}] Ejecutando...`);
    try {
      await handler();
      const duration = Date.now() - start;
      console.log(`✅ [${name}] Completado en ${duration}ms`);
      await logJob(name, 'success', duration);
    } catch (err) {
      console.error(`❌ [${name}] Error:`, err.message);
      await logJob(name, 'error', Date.now() - start, err.message);
    }
  }, { timezone: tz });

  jobs.push({ name, schedule, description, job });
}

/**
 * Registra ejecucion del job en DB
 */
async function logJob(name, status, durationMs, error = null) {
  try {
    await db.query(
      `INSERT INTO scheduler_log (job_name, status, duration_ms, error_message)
       VALUES ($1, $2, $3, $4)`,
      [name, status, durationMs, error]
    );
  } catch (err) {
    console.error('❌ Error registrando job:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  JOB HANDLERS
// ═══════════════════════════════════════════════════════════

/**
 * P4: Multi-stage document expiry alerts.
 * Dispara alerta cuando days_remaining coincide exactamente con cualquier
 * stage en alert_days_array (p.ej. {90,60,30,7}). Dedup por día via notification_log.
 */
async function checkDocumentExpiry() {
  const docs = await db.queryAll(
    `SELECT id, document_name, document_type, expiry_date, country, notes,
       alert_days_array,
       (expiry_date - CURRENT_DATE) AS days_remaining
     FROM document_alerts
     WHERE is_active = TRUE
       AND (expiry_date - CURRENT_DATE) >= 0
       AND ARRAY[(expiry_date - CURRENT_DATE)::int] && alert_days_array
       AND NOT EXISTS (
         SELECT 1 FROM notification_log nl
         WHERE nl.alert_id = document_alerts.id
           AND nl.sent_at::date = CURRENT_DATE
       )
     ORDER BY days_remaining ASC`
  );

  if (!docs.length) {
    console.log('✅ Sin documentos en stage de alerta hoy');
    return;
  }

  const message = telegram.formatDocumentAlert(docs);
  await telegram.sendAlert(message);
  // Loggear UN row por doc para que el dedup funcione correctamente
  for (const d of docs) {
    await telegram.logNotification(d.id, `[stage=${d.days_remaining}d] ${d.document_name}`, 'sent');
  }

  console.log(`📲 Multi-stage alert: ${docs.length} documentos`);
}

/**
 * P4: Tax deadlines — chequea bur_tax_deadlines y dispara según alert_days_array.
 * Multi-país: NZ/ES/AU/EU para usuario dual ES/DZ con WHV NZ.
 * Auto-rolling: si recurring=TRUE y deadline pasó, lo avanza un año.
 */
async function checkTaxDeadlines() {
  // Auto-roll deadlines vencidas con recurring=TRUE → +1 año
  await db.query(
    `UPDATE bur_tax_deadlines
     SET deadline = (deadline + INTERVAL '1 year')::date,
         updated_at = NOW()
     WHERE is_active = TRUE
       AND recurring = TRUE
       AND recurrence_rule = 'YEARLY'
       AND deadline < CURRENT_DATE`
  );

  const deadlines = await db.queryAll(
    `SELECT id, country, name, description, deadline, alert_days_array, notes,
       (deadline - CURRENT_DATE) AS days_remaining
     FROM bur_tax_deadlines
     WHERE is_active = TRUE
       AND (deadline - CURRENT_DATE) >= 0
       AND ARRAY[(deadline - CURRENT_DATE)::int] && alert_days_array
     ORDER BY deadline ASC`
  );

  if (!deadlines.length) {
    console.log('✅ Sin deadlines fiscales hoy');
    return;
  }

  const flag = (c) => ({ NZ: '🇳🇿', ES: '🇪🇸', AU: '🇦🇺', EU: '🇪🇺', DZ: '🇩🇿' }[c] || '🏛️');
  const urgency = (d) => (d <= 7 ? '🔴' : d <= 14 ? '🟠' : d <= 30 ? '🟡' : '🟢');

  const lines = [
    '💼 *ULTRA SYSTEM — Recordatorio Fiscal*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  for (const d of deadlines) {
    const dateStr = new Date(d.deadline).toISOString().split('T')[0];
    lines.push(`${urgency(d.days_remaining)} ${flag(d.country)} *${d.name}*`);
    lines.push(`   📅 ${dateStr} — *${d.days_remaining} días*`);
    if (d.description) lines.push(`   📝 ${d.description}`);
    if (d.notes) lines.push(`   💡 ${d.notes}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🤖 _Ultra Engine — P4 Burocracia_');
  await telegram.sendAlert(lines.join('\n'));

  console.log(`📲 Tax deadlines alert: ${deadlines.length} entries`);
}

/**
 * P4: Vacunaciones próximas a expirar (<60 días).
 * Decisión 2026-04-07: P4 owner de bur_vaccinations.
 * P7 consume vía evento bur.vaccination_updated (publicado por la route POST/PUT).
 */
// ═══════════════════════════════════════════════════════════
//  P4 R4 Tier A — Apostilles / driver licenses / military expiry
//  Una sola query UNION para no abrir 3 conexiones por nada.
//  Threshold: 90 días (más conservador que vaccinations 60d porque
//  apostille re-emit puede tardar semanas).
// ═══════════════════════════════════════════════════════════
async function checkBurDocsExpiry() {
  const rows = await db.queryAll(
    `SELECT 'apostille' AS kind, id, document_name AS name, country_origin AS country,
            expiry_date, (expiry_date - CURRENT_DATE) AS days_remaining, notes
       FROM bur_apostilles
      WHERE is_active = TRUE AND expiry_date IS NOT NULL
        AND (expiry_date - CURRENT_DATE) BETWEEN 0 AND 90
     UNION ALL
     SELECT 'driver_license', id,
            COALESCE(license_number, 'Driver license') AS name, country,
            expiry_date, (expiry_date - CURRENT_DATE), notes
       FROM bur_driver_licenses
      WHERE is_active = TRUE
        AND (expiry_date - CURRENT_DATE) BETWEEN 0 AND 90
     UNION ALL
     SELECT 'military', id,
            COALESCE(obligation_type, 'Military obligation') AS name, country,
            expiry_date, (expiry_date - CURRENT_DATE), notes
       FROM bur_military_obligations
      WHERE expiry_date IS NOT NULL
        AND (expiry_date - CURRENT_DATE) BETWEEN 0 AND 90
     ORDER BY days_remaining ASC`
  );

  if (!rows.length) {
    console.log('✅ Sin apostilles/licencias/obligaciones militares expirando');
    return;
  }

  const flag = (c) => ({ NZ: '🇳🇿', ES: '🇪🇸', AU: '🇦🇺', EU: '🇪🇺', DZ: '🇩🇿', FR: '🇫🇷', GB: '🇬🇧' }[c] || '');
  const icon = (k) => ({ apostille: '📜', driver_license: '🚗', military: '🎖️' }[k] || '📂');

  const lines = [
    '📂 *ULTRA SYSTEM — Documentos burocracia por renovar*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];
  for (const r of rows) {
    const exp = new Date(r.expiry_date).toISOString().split('T')[0];
    const urgent = r.days_remaining <= 14 ? '🔴' : r.days_remaining <= 30 ? '🟡' : '🟢';
    lines.push(`${urgent} ${icon(r.kind)} *${r.name}* ${flag(r.country)}`);
    lines.push(`   📅 ${exp} — ${r.days_remaining} días`);
    if (r.notes) lines.push(`   💬 ${r.notes.slice(0, 100)}`);
    lines.push('');
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));
  console.log(`📲 bur-docs expiry alert: ${rows.length} entries`);
}

async function checkVaccinationExpiry() {
  const vaccines = await db.queryAll(
    `SELECT id, vaccine, dose_number, date_given, expiry_date, country, notes,
       (expiry_date - CURRENT_DATE) AS days_remaining
     FROM bur_vaccinations
     WHERE expiry_date IS NOT NULL
       AND (expiry_date - CURRENT_DATE) BETWEEN 0 AND 60
     ORDER BY expiry_date ASC`
  );

  if (!vaccines.length) {
    console.log('✅ Sin vacunaciones expirando');
    return;
  }

  const flag = (c) => ({ NZ: '🇳🇿', ES: '🇪🇸', AU: '🇦🇺', EU: '🇪🇺', DZ: '🇩🇿' }[c] || '');

  const lines = [
    '💉 *ULTRA SYSTEM — Vacunaciones por renovar*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  for (const v of vaccines) {
    const exp = new Date(v.expiry_date).toISOString().split('T')[0];
    const urgent = v.days_remaining <= 14 ? '🔴' : v.days_remaining <= 30 ? '🟡' : '🟢';
    const dose = v.dose_number ? ` (dosis ${v.dose_number})` : '';
    lines.push(`${urgent} *${v.vaccine}*${dose} ${flag(v.country)}`);
    lines.push(`   📅 Caduca ${exp} — ${v.days_remaining} días`);
    if (v.notes) lines.push(`   💬 ${v.notes}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));

  console.log(`📲 Vaccination expiry alert: ${vaccines.length} entries`);
}

/**
 * P1: Fetch RSS feeds con scoring por keywords
 * Alerta via Telegram si hay articulos de alta relevancia
 */
async function fetchRssFeeds() {
  try {
    const rss = require('./rss');
    const { totalNew, highScoreArticles } = await rss.fetchAll();

    // Alertar via Telegram si hay articulos relevantes
    if (highScoreArticles.length > 0) {
      const lines = [
        '📰 *ULTRA SYSTEM — Noticias Relevantes*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
      ];

      for (const article of highScoreArticles.slice(0, 5)) {
        lines.push(`⭐ *${article.title}*`);
        lines.push(`   📊 Score: ${article.score} | 📰 ${article.feed}`);
        lines.push(`   🔗 ${article.url}`);
        lines.push('');
      }

      if (highScoreArticles.length > 5) {
        lines.push(`... y ${highScoreArticles.length - 5} mas`);
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      await telegram.sendAlert(lines.join('\n'));
    }

    console.log(`📰 RSS: ${totalNew} nuevos, ${highScoreArticles.length} alertados`);
  } catch (err) {
    // Modulo P1 puede no estar listo
    console.warn('⚠️ RSS fetch falló:', err.message);
  }
}

/**
 * P2: Scrape fuentes de empleo (stub — se implementara con scraper.js)
 */
async function scrapeJobSources() {
  try {
    const scraper = require('./scraper');
    await scraper.checkAll();
  } catch {
    // Module P2 aun no activo
  }
}

/**
 * P3: Verifica budgets que exceden 80% del limite y alerta
 */
async function checkBudgetAlerts() {
  const month = new Date().toISOString().slice(0, 7);

  const alerts = await db.queryAll(
    `SELECT
       b.category,
       b.monthly_limit,
       COALESCE(SUM(f.amount), 0) as spent,
       ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1) as percent_used
     FROM budgets b
     LEFT JOIN finances f ON LOWER(f.category) = LOWER(b.category)
       AND f.type = 'expense'
       AND TO_CHAR(f.date, 'YYYY-MM') = $1
     GROUP BY b.category, b.monthly_limit
     HAVING COALESCE(SUM(f.amount), 0) >= b.monthly_limit * 0.8
     ORDER BY percent_used DESC`,
    [month]
  );

  if (!alerts.length) {
    console.log('✅ Sin alertas de presupuesto');
    return;
  }

  // Calcular runway tambien
  const incomeRow = await db.queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM finances
     WHERE type = 'income' AND TO_CHAR(date, 'YYYY-MM') = $1`, [month]
  );
  const expenseRow = await db.queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM finances
     WHERE type = 'expense' AND TO_CHAR(date, 'YYYY-MM') = $1`, [month]
  );

  const income = parseFloat(incomeRow.total);
  const expense = parseFloat(expenseRow.total);
  const remaining = income - expense;
  const dayOfMonth = new Date().getDate();
  const dailyBurn = dayOfMonth > 0 ? expense / dayOfMonth : 0;
  const runway = dailyBurn > 0 ? Math.floor(remaining / dailyBurn) : 999;

  const lines = [
    '⚠️ *ULTRA SYSTEM — Alerta de Presupuesto*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📅 ${month} | 💵 Restante: $${remaining.toFixed(2)} | ⏳ Runway: ${runway} dias`,
    '',
  ];

  for (const a of alerts) {
    const emoji = parseFloat(a.percent_used) >= 100 ? '🔴' : '🟡';
    lines.push(`${emoji} *${a.category}*: $${parseFloat(a.spent).toFixed(2)} / $${parseFloat(a.monthly_limit).toFixed(2)} (${a.percent_used}%)`);
  }

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));

  console.log(`📲 ${alerts.length} alertas de presupuesto enviadas`);
}

/**
 * P3: Fetch daily FX rates (Frankfurter primary, fawazahmed0 fallback)
 */
async function fetchFxRates() {
  const r = await fx.fetchLatest();
  console.log(`💱 FX: ${r.count} rates para ${r.date}`);
}

/**
 * P3: Snapshot net worth diario.
 * Calcula income - expense acumulado en NZD desde inicio + cualquier balance Wise (si configurado).
 */
async function snapshotNetWorth() {
  const total = await db.queryOne(
    `SELECT COALESCE(
       SUM(CASE WHEN type='income' THEN COALESCE(amount_nzd, amount) ELSE 0 END) -
       SUM(CASE WHEN type='expense' THEN COALESCE(amount_nzd, amount) ELSE 0 END),
       0
     ) AS nw FROM finances`
  );
  const breakdown = await db.queryAll(
    `SELECT COALESCE(account, 'manual') AS account,
       SUM(CASE WHEN type='income' THEN COALESCE(amount_nzd, amount) ELSE 0 END) -
       SUM(CASE WHEN type='expense' THEN COALESCE(amount_nzd, amount) ELSE 0 END) AS nw
     FROM finances GROUP BY account`
  );

  // P3 Fase 2: añadir crypto holdings al NW total
  let cryptoTotal = 0;
  let cryptoBreakdown = [];
  try {
    const cr = await cryptoMod.getHoldings();
    cryptoTotal = cr.total_nzd || 0;
    cryptoBreakdown = cr.holdings.map(h => ({
      account: `crypto:${h.exchange}:${h.symbol}`,
      nw: h.value_nzd,
    }));
  } catch (err) {
    console.warn('nw-snapshot: crypto fetch failed:', err.message);
  }

  const fiatNw = parseFloat(total.nw);
  const grandTotal = fiatNw + cryptoTotal;
  const fullBreakdown = [...breakdown.map(b => ({ account: b.account, nw: parseFloat(b.nw) })), ...cryptoBreakdown];

  const today = new Date().toISOString().split('T')[0];
  await db.query(
    `INSERT INTO fin_net_worth_snapshots (date, total_nzd, breakdown)
     VALUES ($1, $2, $3)
     ON CONFLICT (date) DO UPDATE SET total_nzd = EXCLUDED.total_nzd, breakdown = EXCLUDED.breakdown`,
    [today, grandTotal, JSON.stringify(fullBreakdown)]
  );
  console.log(`📊 NW snapshot ${today}: fiat $${fiatNw.toFixed(2)} + crypto $${cryptoTotal.toFixed(2)} = $${grandTotal.toFixed(2)} NZD`);
}

/**
 * P6: Fetch weather forecast 7d para current location del usuario.
 * Si no hay current location en log_locations, no hace nada.
 */
async function fetchWeatherCurrentLocation() {
  const cur = await weatherMod.getCurrentLocation();
  if (!cur) {
    console.log('🌡️ [weather] Sin current location en log_locations');
    return;
  }
  const r = await weatherMod.fetchForecast(parseFloat(cur.latitude), parseFloat(cur.longitude));
  console.log(`🌡️ [weather] ${r.inserted} días para ${cur.name}`);
}

/**
 * P6: DOC NZ campsites refresh semanal.
 */
async function refreshDocNz() {
  try {
    const r = await docNz.refreshAll();
    console.log(`🏕️ [doc-nz] ${r.inserted} new + ${r.updated} updated (${r.total} total)`);
  } catch (err) {
    console.warn('⚠️ [doc-nz] Falló:', err.message);
  }
}

/**
 * P6: Membership renewal alerts.
 * Avisa si Workaway/MindMyHouse/WWOOF/HelpX renueva en <60 días.
 */
async function checkMembershipExpiry() {
  const rows = await db.queryAll(
    `SELECT id, platform, annual_cost, currency, renews_at,
       (renews_at - CURRENT_DATE) AS days_remaining
     FROM log_memberships
     WHERE is_active = TRUE AND renews_at IS NOT NULL
       AND (renews_at - CURRENT_DATE) BETWEEN 0 AND 60
     ORDER BY renews_at ASC`
  );
  if (!rows.length) {
    console.log('✅ Sin memberships expirando');
    return;
  }
  const lines = ['🏠 *Memberships housesit/work-exchange — Renovación próxima*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
  for (const r of rows) {
    const d = new Date(r.renews_at).toISOString().split('T')[0];
    const urgent = r.days_remaining <= 14 ? '🔴' : r.days_remaining <= 30 ? '🟡' : '🟢';
    lines.push(`${urgent} *${r.platform}* — ${r.annual_cost} ${r.currency}`);
    lines.push(`   📅 Renueva ${d} (${r.days_remaining} días)`);
    lines.push('');
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));
  console.log(`📲 Membership alert: ${rows.length}`);
}

/**
 * P2: ATS APIs fetcher (Greenhouse/Lever/Ashby/SmartRecruiters).
 * Decisión 2026-04-07: P2 = presencial. Las posiciones is_remote=true
 * son descartadas (las cubre P5 via opp_fetchers).
 */
async function fetchAtsJobs() {
  const r = await jobApis.fetchAll();
  console.log(`💼 [ats-fetch] ${r.totalInserted} new presencial · ${r.totalSkippedRemote} remote→P5`);

  // Alertar high-score (≥75 = match casi total)
  const top = await db.queryAll(
    `SELECT title, company, location_country, location_raw, salary_min, salary_max, salary_currency, total_score, url
     FROM job_listings
     WHERE total_score >= 75 AND scraped_at > NOW() - INTERVAL '15 minutes'
     ORDER BY total_score DESC LIMIT 5`
  );
  if (top.length > 0) {
    const flag = (c) => ({ NZ: '🇳🇿', AU: '🇦🇺', ES: '🇪🇸', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪' }[c] || '🌍');
    const lines = ['💼 *Empleo High-Score (presencial)*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
    for (const j of top) {
      const sal = j.salary_min && j.salary_max
        ? ` · 💰 ${j.salary_min}-${j.salary_max} ${j.salary_currency || 'USD'}` : '';
      lines.push(`⭐ *${j.total_score}* ${flag(j.location_country)} ${j.title.substring(0, 80)}`);
      lines.push(`   🏢 ${j.company} · ${j.location_raw}${sal}`);
      lines.push(`   🔗 ${j.url}`);
      lines.push('');
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    await telegram.sendAlert(lines.join('\n'));
  }
}

/**
 * P5: Multi-source remote opportunities fetcher.
 * Decisión 2026-04-07: P5 = remoto. Las 6 fuentes (RemoteOK, Remotive,
 * Himalayas, Jobicy, HN Who's Hiring, GitHub bounty issues) devuelven
 * todas posiciones remotas → entran a `opportunities`.
 */
async function fetchOpportunities() {
  const r = await oppFetchers.fetchAll();
  console.log(`🎯 [opp-fetch] ${r.totalInserted} new total · ${r.totalHighScore} high-score`);

  // P5 Fase 2: post-fetch rescore matching score vs emp_profile
  try {
    const matching = require('./matching');
    const ms = await matching.rescoreOpportunities();
    if (ms.ok) console.log(`🎯 [opp-fetch] match rescore: ${ms.updated}/${ms.scanned}`);
  } catch (err) {
    console.warn('match rescore failed:', err.message);
  }

  if (r.totalHighScore > 0) {
    // Pull top high-score nuevos para alertar
    const top = await db.queryAll(
      `SELECT title, source, url, match_score, salary_min, salary_max, currency
       FROM opportunities
       WHERE match_score >= 8 AND last_seen > NOW() - INTERVAL '15 minutes'
       ORDER BY match_score DESC LIMIT 5`
    );
    if (top.length > 0) {
      const lines = ['🎯 *Oportunidades High-Score*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const o of top) {
        const salary = o.salary_min && o.salary_max ? ` · ${o.salary_min}-${o.salary_max} ${o.currency || 'USD'}` :
                       o.salary_min ? ` · ${o.salary_min}+ ${o.currency || 'USD'}` : '';
        lines.push(`⭐ ${o.match_score} · *${o.title.substring(0, 100)}*`);
        lines.push(`   📍 ${o.source}${salary}`);
        lines.push(`   🔗 ${o.url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      await telegram.sendAlert(lines.join('\n'));
    }
  }
}

/**
 * P5: Verifica deadlines proximos y follow-ups pendientes
 */
async function checkOpportunityReminders() {
  // Deadlines en los proximos 3 dias
  const deadlines = await db.queryAll(
    `SELECT id, title, deadline, status,
       (deadline - CURRENT_DATE) as days_until
     FROM opportunities
     WHERE deadline IS NOT NULL
       AND deadline >= CURRENT_DATE
       AND deadline <= CURRENT_DATE + 3
       AND status NOT IN ('rejected', 'won')
     ORDER BY deadline ASC`
  );

  // Follow-ups necesarios (contacted >7 dias)
  const followUps = await db.queryAll(
    `SELECT id, title, source,
       (CURRENT_DATE - created_at::date) as days_since
     FROM opportunities
     WHERE status = 'contacted'
       AND created_at < NOW() - INTERVAL '7 days'
     ORDER BY created_at ASC`
  );

  if (!deadlines.length && !followUps.length) {
    console.log('✅ Sin recordatorios de oportunidades');
    return;
  }

  const lines = [
    '🎯 *ULTRA SYSTEM — Recordatorios*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  if (deadlines.length) {
    lines.push('', '📅 *Deadlines proximos:*');
    for (const d of deadlines) {
      const urgency = d.days_until === 0 ? '🔴 HOY' : d.days_until === 1 ? '🟡 MANANA' : `🟢 en ${d.days_until} dias`;
      lines.push(`   ${urgency} — *${d.title}*`);
    }
  }

  if (followUps.length) {
    lines.push('', '📧 *Necesitan follow-up (>7 dias):*');
    for (const f of followUps) {
      lines.push(`   ⏰ *${f.title}* — ${f.days_since} dias sin respuesta`);
      if (f.source) lines.push(`      📍 ${f.source}`);
    }
  }

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));

  console.log(`📲 Recordatorios: ${deadlines.length} deadlines, ${followUps.length} follow-ups`);
}

/**
 * P6: Alerta de items de logistica en las proximas 48 horas
 */
async function checkLogisticsNext48h() {
  const items = await db.queryAll(
    `SELECT type, title, date, location, status,
       (date - CURRENT_DATE) AS days_until
     FROM logistics
     WHERE date >= CURRENT_DATE
       AND date <= CURRENT_DATE + INTERVAL '2 days'
       AND status != 'done'
     ORDER BY date ASC`
  );

  if (!items.length) {
    console.log('✅ Sin items de logistica en 48h');
    return;
  }

  const typeEmoji = { transport: '🚌', accommodation: '🏠', visa: '🛂', appointment: '📋' };
  const urgencyMap = { 0: '🔴 HOY', 1: '🟡 MANANA', 2: '🟢 Pasado manana' };

  const lines = [
    '🗺️ *ULTRA SYSTEM — Logistica 48h*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  for (const item of items) {
    const emoji = typeEmoji[item.type] || '📌';
    const urgency = urgencyMap[item.days_until] || '📌';
    const statusIcon = item.status === 'confirmed' ? '✅' : '⏳';

    lines.push(`${urgency} ${emoji} ${statusIcon} *${item.title}*`);
    if (item.location) lines.push(`   📍 ${item.location}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));

  console.log(`📲 ${items.length} items de logistica alertados`);
}

/**
 * P7: Fetch outbreak alerts WHO/CDC/ECDC. Si hay nuevas para país relevante,
 * envía resumen via Telegram.
 */
async function fetchHealthAlerts() {
  const r = await healthScrapers.fetchAll();
  if (r.totalNew > 0) {
    // Si hay alertas de WHO o ECDC con país en lista del usuario, alertar
    const recent = await db.queryAll(
      `SELECT source, country_iso, disease, title, url
       FROM health_alerts
       WHERE fetched_at > NOW() - INTERVAL '1 hour'
         AND source IN ('WHO','ECDC','CDC')
       ORDER BY published_at DESC LIMIT 5`
    );
    if (recent.length > 0) {
      const lines = ['🩺 *Outbreak Alerts — Última hora*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const a of recent) {
        const flag = a.country_iso ? `[${a.country_iso}]` : '[GLOBAL]';
        const dis = a.disease ? `*${a.disease}* · ` : '';
        lines.push(`⚠️ ${flag} ${dis}${a.title.substring(0, 120)}`);
        lines.push(`   📰 ${a.source} · ${a.url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      await telegram.sendAlert(lines.join('\n'));
    }
  }
  console.log(`🩺 Health alerts: ${r.totalNew} new ·`, r.bySource);
}

/**
 * P7: Probe los 4 containers self-hosted cada 5 minutos.
 * Si alguno cae (status -1) por más de 15 min consecutivos, alerta.
 */
async function probeExternalHealth() {
  const results = await externalHealth.probeAll();
  // Solo alertar si hay servicios down (no spam por degraded)
  const down = results.filter(r => r.status === -1);
  if (down.length > 0) {
    // Verificar si llevaba >15 min caído (3 probes fallidos)
    // Por ahora solo log, sin spam Telegram
    console.warn(`🩺 [external] DOWN:`, down.map(d => d.service).join(', '));
  }
}

/**
 * P7: Resumen bio semanal con promedios y correlaciones
 * Se ejecuta domingo a las 20:00
 */
async function sendBioWeeklySummary() {
  const weekly = await db.queryOne(
    `SELECT
       COUNT(*) AS entries,
       ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep,
       ROUND(AVG(energy_level)::numeric, 1) AS avg_energy,
       ROUND(AVG(mood)::numeric, 1) AS avg_mood,
       ROUND(AVG(exercise_minutes)::numeric, 0) AS avg_exercise
     FROM bio_checks
     WHERE date >= CURRENT_DATE - 7`
  );

  if (!weekly || parseInt(weekly.entries) === 0) {
    console.log('📭 Sin registros bio esta semana');
    return;
  }

  const bar = (val) => {
    const filled = Math.round(parseFloat(val));
    return '█'.repeat(Math.min(10, Math.max(0, filled))) + '░'.repeat(Math.max(0, 10 - filled));
  };

  const lines = [
    '🧬 *ULTRA SYSTEM — Bio Resumen Semanal*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📊 Registros: ${weekly.entries}/7`,
    '',
    `😴 Sueno: ${weekly.avg_sleep}h`,
    `⚡ Energia: ${bar(weekly.avg_energy)} ${weekly.avg_energy}/10`,
    `😊 Animo: ${bar(weekly.avg_mood)} ${weekly.avg_mood}/10`,
    `🏃 Ejercicio: ${weekly.avg_exercise} min/dia`,
  ];

  // Alertas de valores bajos
  const avgSleep = parseFloat(weekly.avg_sleep);
  const avgEnergy = parseFloat(weekly.avg_energy);
  const avgMood = parseFloat(weekly.avg_mood);

  if (avgSleep < 6) lines.push('', `⚠️ Sueno bajo (${avgSleep}h) — prioriza descanso`);
  if (avgEnergy < 4) lines.push(`⚠️ Energia baja (${avgEnergy}/10) — revisa alimentacion`);
  if (avgMood < 4) lines.push(`⚠️ Animo bajo (${avgMood}/10) — considera un descanso`);

  // Correlaciones (ultimos 30 dias)
  const data = await db.queryAll(
    `SELECT sleep_hours, energy_level, mood, exercise_minutes
     FROM bio_checks WHERE date >= CURRENT_DATE - 30 ORDER BY date DESC`
  );

  if (data.length >= 3) {
    const sleep = data.map(d => parseFloat(d.sleep_hours));
    const energy = data.map(d => parseInt(d.energy_level));
    const mood = data.map(d => parseInt(d.mood));
    const exercise = data.map(d => parseInt(d.exercise_minutes));

    const corrs = [
      { label: 'Sueno → Energia', val: pearsonCorr(sleep, energy) },
      { label: 'Sueno → Animo', val: pearsonCorr(sleep, mood) },
      { label: 'Ejercicio → Energia', val: pearsonCorr(exercise, energy) },
    ];

    lines.push('', '📈 *Correlaciones (30 dias):*');
    for (const c of corrs) {
      if (c.val !== null) {
        const arrow = c.val > 0 ? '↑' : '↓';
        const strength = Math.abs(c.val) >= 0.7 ? '💪' : Math.abs(c.val) >= 0.4 ? '📊' : '〰️';
        lines.push(`${strength} ${c.label}: ${c.val} ${arrow}`);
      }
    }
  }

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🤖 _Enviado por Ultra Engine_');
  await telegram.sendAlert(lines.join('\n'));

  console.log('📲 Resumen bio semanal enviado');
}

/**
 * Health ping — verifica DB y registra
 */
async function healthPing() {
  const health = await db.healthCheck();
  if (!health.ok) {
    console.error('❌ Health check fallido:', health.error);
    await telegram.sendAlert('🚨 *ALERTA:* Base de datos no responde\\!');
  }
}

// ═══════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════

/**
 * Correlacion de Pearson (duplicada del modulo bio para independencia)
 */
function pearsonCorr(x, y) {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

/**
 * Retorna lista de jobs para el dashboard
 */
function listJobs() {
  return jobs.map((j) => ({
    name: j.name,
    schedule: j.schedule,
    description: j.description,
  }));
}

// ═══════════════════════════════════════════════════════════
//  P7 FASE 4 — Wearable raw → bio_checks daily aggregation
// ═══════════════════════════════════════════════════════════
async function aggregateWearableMetrics() {
  try {
    const dates = await db.queryAll(
      `SELECT DISTINCT measured_at::date AS d FROM bio_wearable_raw WHERE processed = FALSE`
    );
    let updated = 0;
    for (const row of dates) {
      const d = row.d;
      const aggs = await db.queryOne(
        `SELECT
           SUM(CASE WHEN metric_type='steps' THEN value_numeric ELSE 0 END) AS steps,
           AVG(CASE WHEN metric_type='heart_rate' THEN value_numeric END) AS hr_avg,
           AVG(CASE WHEN metric_type='hrv' THEN value_numeric END) AS hrv_avg,
           SUM(CASE WHEN metric_type='sleep' THEN value_numeric ELSE 0 END) AS sleep_hours,
           MAX(CASE WHEN metric_type='weight' THEN value_numeric END) AS weight
         FROM bio_wearable_raw
         WHERE measured_at::date = $1`,
        [d]
      );

      // Cast strings to JS numbers explicitly (pg returns NUMERIC as strings)
      const steps = aggs.steps ? parseInt(aggs.steps, 10) : null;
      const hr = aggs.hr_avg ? Math.round(parseFloat(aggs.hr_avg)) : null;
      const hrv = aggs.hrv_avg ? parseFloat(aggs.hrv_avg) : null;
      const sleepNum = aggs.sleep_hours ? parseFloat(aggs.sleep_hours) : 0;
      const weight = aggs.weight ? parseFloat(aggs.weight) : null;

      const existing = await db.queryOne('SELECT id FROM bio_checks WHERE date = $1', [d]);
      if (existing) {
        await db.query(
          `UPDATE bio_checks SET
             steps = COALESCE($1, steps),
             heart_rate_avg = COALESCE($2, heart_rate_avg),
             hrv = COALESCE($3, hrv),
             sleep_hours = CASE WHEN $4 > 0 THEN $4 ELSE sleep_hours END,
             weight_kg = COALESCE($5, weight_kg),
             source = 'wearable_sync'
           WHERE id = $6`,
          [steps, hr, hrv, sleepNum, weight, existing.id]
        );
      } else {
        await db.query(
          `INSERT INTO bio_checks (date, sleep_hours, energy_level, mood, steps, heart_rate_avg, hrv, weight_kg, source)
           VALUES ($1, $2, 5, 5, $3, $4, $5, $6, 'wearable_sync')`,
          [d, sleepNum > 0 ? sleepNum : 7, steps, hr, hrv, weight]
        );
      }
      updated++;
    }
    await db.query('UPDATE bio_wearable_raw SET processed = TRUE WHERE processed = FALSE');
    if (updated > 0) console.log(`💪 wearable-aggregate: ${updated} dates updated to bio_checks`);
  } catch (err) {
    console.error('❌ wearable-aggregate error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P4 FASE 3c — Paperless OCR → expiry extraction
// ═══════════════════════════════════════════════════════════
async function syncPaperlessOcr() {
  try {
    const paperless = require('./paperless');
    // 1. Sync nuevos docs Paperless → bur_documents (insert/update)
    const sync = await paperless.syncPaperlessToBurDocuments({ limit: 100 });
    if (sync.ok && (sync.inserted || sync.updated)) {
      console.log(`📂 paperless→bur_documents: scanned=${sync.scanned} inserted=${sync.inserted} updated=${sync.updated}`);
    }
    // 2. Enrich document_alerts existentes con expiry dates extraídas
    const ocr = await paperless.syncOcrExtractions({ limit: 100 });
    if (ocr.ok && ocr.updated > 0) {
      console.log(`📂 paperless-ocr enrich: scanned=${ocr.scanned} updated=${ocr.updated}`);
    }
  } catch (err) {
    console.error('❌ paperless-ocr-sync error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P1 FASE 3b — NLP processing (AFINN + TextRank)
// ═══════════════════════════════════════════════════════════
async function runNlpProcess() {
  try {
    const nlp = require('./nlp');
    const rows = await db.queryAll(
      `SELECT id, title, summary FROM rss_articles
       WHERE sentiment_score IS NULL
       ORDER BY id DESC LIMIT 500`
    );
    let processed = 0;
    for (const r of rows) {
      const text = `${r.title || ''} ${r.summary || ''}`;
      const sent = nlp.sentiment(text);
      const auto = nlp.summarize(r.summary || r.title || '', { numSentences: 2 });
      const ents = nlp.extractEntities(text);
      await db.query(
        `UPDATE rss_articles SET sentiment_score=$1, sentiment_label=$2, auto_summary=$3, entities=$4 WHERE id=$5`,
        [sent.comparative, sent.label, auto || null, JSON.stringify(ents), r.id]
      );
      processed++;
    }
    if (processed > 0) console.log(`📝 nlp-process: ${processed} articles enriched (sentiment + summary + entities)`);
  } catch (err) {
    console.error('❌ nlp-process error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P5 FASE 3b — Gov grants fetch
// ═══════════════════════════════════════════════════════════
async function fetchGovGrants() {
  try {
    const results = await govGrants.fetchAll();
    const summary = results.map(r => `${r.source}=${r.inserted ?? r.error?.slice(0,30) ?? '?'}`).join(' ');
    console.log(`💰 gov-grants: ${summary}`);
  } catch (err) {
    console.error('❌ gov-grants error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P4 FASE 3a — Schengen + visa window auto-detect
// ═══════════════════════════════════════════════════════════
async function checkSchengenAndVisaWindows() {
  try {
    const schengenMod = require('./schengen');
    // 1. Schengen status hoy
    const status = await schengenMod.getSchengenStatus(new Date());
    if (status.days_used >= 60) {
      const lines = [
        `🛂 *Schengen alert*`,
        `📊 Días usados: *${status.days_used}/90* (quedan ${status.days_remaining})`,
        `🪟 Ventana: ${status.window_start} → ${status.window_end}`,
      ];
      if (status.overstay) lines.push('🚨 *OVERSTAY ACTIVO*');
      if (status.next_full_90_window) {
        lines.push(`🎯 Próximo stay 90d completo: ${status.next_full_90_window.earliest_date}`);
      }
      await telegram.sendAlert(lines.join('\n'));
    }

    // 2. Visa window detector — busca trips ongoing (sin exit_date) y alerta si days_in_country
    //    se acerca al límite del visa requirement
    const ongoing = await db.queryAll(
      `SELECT t.id, t.country, t.entry_date, t.passport_used,
              (CURRENT_DATE - t.entry_date) + 1 AS days_in_country,
              v.requirement, v.days_allowed
       FROM bur_travel_log t
       LEFT JOIN bur_visa_matrix v
         ON v.passport = t.passport_used AND v.destination = t.country
       WHERE t.exit_date IS NULL`
    );
    for (const trip of ongoing) {
      const allowed = trip.days_allowed;
      const used = parseInt(trip.days_in_country, 10);
      if (allowed && allowed > 0) {
        const ratio = used / allowed;
        if (ratio >= 0.7) {
          // Alerta cuando llevas >70% de días permitidos
          const remaining = allowed - used;
          const urgEmoji = ratio >= 0.95 ? '🚨' : ratio >= 0.85 ? '🔴' : '🟡';
          await telegram.sendAlert(
            `${urgEmoji} *Visa window alert — ${trip.country}*\n` +
            `🛂 Pasaporte: ${trip.passport_used}\n` +
            `📅 Entrada: ${trip.entry_date}\n` +
            `⏱️ Días en país: *${used}/${allowed}* (${remaining} restantes)\n` +
            `📋 Requirement: ${trip.requirement}`
          );
        }
      }
    }
    console.log(`🛂 schengen-daily-check: used=${status.days_used}/90, ongoing trips=${ongoing.length}`);
  } catch (err) {
    console.error('❌ schengen-daily-check error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P6 FASE 2 — Traccar GPS sync
// ═══════════════════════════════════════════════════════════
async function syncTraccarGps() {
  try {
    const r = await traccar.syncPositions();
    if (r.ok && r.positions_inserted > 0) {
      console.log(`📍 traccar-sync: ${r.devices} devices, ${r.positions_inserted} positions new`);
    }
  } catch (err) {
    // Silent fail si Traccar no está reachable (no es crítico)
    if (!err.message?.includes('not reachable')) {
      console.warn('traccar sync warn:', err.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  P2 FASE 2 — Gov job sources fetch
// ═══════════════════════════════════════════════════════════
async function fetchGovJobs() {
  try {
    const results = await govJobs.fetchAll();
    const summary = results
      .map(r => `${r.source}=${r.inserted ?? r.updated ?? r.error?.slice(0, 30) ?? r.reason ?? '?'}`)
      .join(' ');
    console.log(`🏛️ gov-jobs: ${summary}`);
  } catch (err) {
    console.error('❌ gov-jobs error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P2 R4 Tier A — Visa sponsor repos import (weekly)
//  SiaExplains + geshan AU + oussama NL + Canada LMIA → emp_visa_sponsors
// ═══════════════════════════════════════════════════════════
async function fetchVisaSponsors() {
  try {
    const results = await govJobs.importAllSponsorRepos();
    const summary = results
      .map(r => `${r.source}=${r.inserted ?? r.updated ?? r.error?.slice(0, 30) ?? '?'}`)
      .join(' ');
    console.log(`🛂 visa-sponsors: ${summary}`);
  } catch (err) {
    console.error('❌ visa-sponsors error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P1 FASE 2 — Early warning feeds (USGS + WHO + ACLED)
// ═══════════════════════════════════════════════════════════
async function fetchEarlyWarning() {
  try {
    const results = await earlyWarning.fetchAll();
    const summary = results.map(r => `${r.source}=${r.inserted ?? r.error ?? r.reason ?? '?'}`).join(' ');
    console.log(`🌐 early-warning: ${summary}`);

    // Alerta inmediata si hay event critical en países del usuario o ruta planificada
    const critical = await db.queryAll(
      `SELECT source, event_type, severity, title, country, occurred_at
       FROM events_store
       WHERE severity IN ('critical', 'high')
         AND created_at >= NOW() - INTERVAL '15 minutes'
       ORDER BY occurred_at DESC LIMIT 10`
    );
    if (critical.length > 0) {
      const lines = ['🚨 *Early warning* — eventos críticos nuevos:'];
      for (const e of critical) {
        const flag = e.country || '🌐';
        lines.push(`${flag} [${e.severity}] ${e.title}`);
      }
      await telegram.sendAlert(lines.join('\n'));
    }
  } catch (err) {
    console.error('❌ early-warning error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P1 FASE 2 — MinHash dedup runner
// ═══════════════════════════════════════════════════════════
async function runMinhashDedup() {
  try {
    const r = await dedupRunner.runAll({ lookbackDays: 30, threshold: 0.7 });
    const total = (r.rss?.marked || 0) + (r.opportunities?.marked || 0) + (r.job_listings?.marked || 0);
    console.log(
      `🧬 minhash-dedup: rss=${r.rss?.marked || 0}/${r.rss?.scanned || 0} ` +
      `opps=${r.opportunities?.marked || 0}/${r.opportunities?.scanned || 0} ` +
      `jobs=${r.job_listings?.marked || 0}/${r.job_listings?.scanned || 0} ` +
      `(total marked: ${total})`
    );
  } catch (err) {
    console.error('❌ minhash-dedup error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P3 FASE 2 — Recurring expenses detection
// ═══════════════════════════════════════════════════════════
async function detectRecurringExpenses() {
  try {
    const result = await recurring.detectRecurring({ lookbackDays: 365, minSamples: 3 });
    console.log(`🔁 recurring-detect: scanned=${result.scanned_rows} detected=${result.detected} (+${result.inserted}/~${result.updated})`);
  } catch (err) {
    console.error('❌ recurring-detect error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P4 FASE 2 — changedetection.io sync handler
// ═══════════════════════════════════════════════════════════
async function syncCdioWatches() {
  try {
    const result = await cdio.syncWatches();
    if (result.ok === false) {
      console.warn('⏭️  cdio-sync skipped:', result.error);
      return;
    }
    if (result.created > 0) {
      console.log(`✅ cdio-sync: ${result.created} watches creados, ${result.skipped} ya existían`);
    }
    if (result.errors && result.errors.length) {
      console.warn(`⚠️  cdio-sync: ${result.errors.length} errores`, result.errors);
    }
  } catch (err) {
    console.error('❌ cdio-sync error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P1 Lote A B5 — intel watches sync handler
// ═══════════════════════════════════════════════════════════
async function syncIntelWatchesJob() {
  try {
    const result = await intelWatches.syncIntelWatches();
    if (result.ok === false) {
      console.warn('⏭️  intel-watches-sync skipped:', result.error);
      return;
    }
    if (result.created > 0) {
      console.log(`🛰️  intel-watches-sync: ${result.created} watches creados, ${result.skipped} ya existían`);
    }
    if (result.errors && result.errors.length) {
      console.warn(`⚠️  intel-watches-sync: ${result.errors.length} errores`, result.errors);
    }
  } catch (err) {
    console.error('❌ intel-watches-sync error:', err.message);
  }
}

  // ─── Taxonomy materialized views refresh ──────────────────────────
  register('taxonomy-refresh', '5 */2 * * *', async () => {
    try {
      const t0 = Date.now();
      const db = require('./db');
      await db.queryOne(`REFRESH MATERIALIZED VIEW CONCURRENTLY v_news_by_topic`);
      await db.queryOne(`REFRESH MATERIALIZED VIEW CONCURRENTLY v_news_by_region`);
      await db.queryOne(`REFRESH MATERIALIZED VIEW CONCURRENTLY v_news_by_country_topic`);
      await db.queryOne(`REFRESH MATERIALIZED VIEW CONCURRENTLY v_feed_quality`);
      console.log(`📊 taxonomy-refresh: 4 views refreshed ${Date.now() - t0}ms`);
    } catch (err) { console.error('❌ taxonomy-refresh:', err.message); }
  }, 'Cada 2h :05 — refresh taxonomy materialized views');

module.exports = { init, listJobs };
