-- ════════════════════════════════════════════════════════════
--  WM Phase 2 — schema for clustering + focal-point detector
--
--  Idempotent (IF NOT EXISTS). Safe to re-run on prod.
--  This file documents the tables for the WorldMonitor absorption,
--  Phase 2. Step 1 (wm_clusters) was applied directly to prod in
--  commit e2f0c40 without leaving the SQL in the repo — this file
--  retroactively captures it so the schema is reproducible.
-- ════════════════════════════════════════════════════════════

-- ─── Step 1: clustering output ──────────────────────────────
CREATE TABLE IF NOT EXISTS wm_clusters (
  id                 SERIAL PRIMARY KEY,
  cluster_key        TEXT NOT NULL UNIQUE,
  primary_title      TEXT NOT NULL,
  primary_source     TEXT,
  primary_link       TEXT,
  source_count       INTEGER NOT NULL DEFAULT 1,
  top_sources        JSONB,
  threat_level       TEXT,
  threat_category    TEXT,
  threat_confidence  NUMERIC(4,3),
  first_seen         TIMESTAMPTZ NOT NULL,
  last_seen          TIMESTAMPTZ NOT NULL,
  member_count       INTEGER NOT NULL DEFAULT 1,
  raw                JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_clusters_last_seen
  ON wm_clusters (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_wm_clusters_threat
  ON wm_clusters (threat_level) WHERE threat_level IS NOT NULL;

-- ─── Step 2: focal-point detector output ────────────────────
-- Mirrors src/worldmonitor/types/index.ts → FocalPoint interface.
-- One row per entity_id (country/company/index/commodity/crypto/sector).
-- Idempotent upsert via UNIQUE(entity_id) — re-runs each hour bump
-- last_seen and refresh scoring/narrative.
CREATE TABLE IF NOT EXISTS wm_focal_points (
  id                    SERIAL PRIMARY KEY,
  entity_id             TEXT NOT NULL UNIQUE,
  entity_type           TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  news_mentions         INTEGER NOT NULL DEFAULT 0,
  news_velocity         NUMERIC(10,4) NOT NULL DEFAULT 0,
  top_headlines         JSONB,
  signal_types          JSONB,
  signal_count          INTEGER NOT NULL DEFAULT 0,
  high_severity_count   INTEGER NOT NULL DEFAULT 0,
  signal_descriptions   JSONB,
  focal_score           NUMERIC(6,2) NOT NULL DEFAULT 0,
  urgency               TEXT NOT NULL CHECK (urgency IN ('watch','elevated','critical')),
  narrative             TEXT,
  correlation_evidence  JSONB,
  raw                   JSONB,
  first_seen            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_focal_points_score
  ON wm_focal_points (focal_score DESC);
CREATE INDEX IF NOT EXISTS idx_wm_focal_points_urgency
  ON wm_focal_points (urgency)
  WHERE urgency IN ('elevated','critical');
CREATE INDEX IF NOT EXISTS idx_wm_focal_points_last_seen
  ON wm_focal_points (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_wm_focal_points_entity_type
  ON wm_focal_points (entity_type);

-- ─── Step 3: country instability scores ─────────────────────
-- Mirrors src/worldmonitor/services/country-instability.ts → CountryScore.
-- One row per ISO country code. Refreshed hourly: upsert by code, bumps
-- last_seen + updated_at. change_24h is the diff vs the previous run held
-- in the in-memory previousScores map of country-instability.ts.
CREATE TABLE IF NOT EXISTS wm_country_scores (
  id                      SERIAL PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,
  name                    TEXT NOT NULL,
  score                   INTEGER NOT NULL DEFAULT 0,
  level                   TEXT NOT NULL CHECK (level IN ('low','normal','elevated','high','critical')),
  trend                   TEXT NOT NULL CHECK (trend IN ('rising','stable','falling')),
  change_24h              NUMERIC(6,2) NOT NULL DEFAULT 0,
  component_unrest        INTEGER NOT NULL DEFAULT 0,
  component_conflict      INTEGER NOT NULL DEFAULT 0,
  component_security      INTEGER NOT NULL DEFAULT 0,
  component_information   INTEGER NOT NULL DEFAULT 0,
  raw                     JSONB,
  first_seen              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_country_scores_score
  ON wm_country_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_wm_country_scores_level
  ON wm_country_scores (level)
  WHERE level IN ('elevated','high','critical');
CREATE INDEX IF NOT EXISTS idx_wm_country_scores_last_seen
  ON wm_country_scores (last_seen DESC);

-- ─── Step 4: trending keyword spikes ───────────────────────
-- Mirrors src/worldmonitor/services/trending-keywords.ts → TrendingSpike
-- (transformado a CorrelationSignal en handleSpike). Una fila por término
-- spike-detected en las últimas 2h. Idempotente por (term): nuevos spikes
-- del mismo término refrescan count/multiplier/sources y bumpean last_seen.
-- mention_count = recent count en rolling window 2h.
-- baseline = average diaria sobre baseline window 7d (0 si cold-start).
-- multiplier = recent / baseline (0 si baseline=0).
CREATE TABLE IF NOT EXISTS wm_trending_keywords (
  id                 SERIAL PRIMARY KEY,
  term               TEXT NOT NULL UNIQUE,
  mention_count      INTEGER NOT NULL DEFAULT 0,
  baseline           NUMERIC(10,4) NOT NULL DEFAULT 0,
  multiplier         NUMERIC(10,4) NOT NULL DEFAULT 0,
  unique_sources     INTEGER NOT NULL DEFAULT 0,
  window_hours       NUMERIC(5,2) NOT NULL DEFAULT 2,
  confidence         NUMERIC(4,3) NOT NULL DEFAULT 0,
  sample_headlines   JSONB,
  signal_type        TEXT,
  raw                JSONB,
  first_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_trending_count
  ON wm_trending_keywords (mention_count DESC);
CREATE INDEX IF NOT EXISTS idx_wm_trending_last_seen
  ON wm_trending_keywords (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_wm_trending_multiplier
  ON wm_trending_keywords (multiplier DESC)
  WHERE multiplier > 0;

-- ─── Step 5: military flight tracking (OpenSky direct OAuth2) ───
-- Mirrors src/worldmonitor/types/index.ts → MilitaryFlight, plus a few
-- DB-level columns. ONE ROW PER (icao24, observed_at) — that is, every
-- cron run inserts a fresh snapshot of every aircraft seen in any of the
-- 4 MILITARY_HOTSPOTS bbox queries. This is intentional historical
-- tracking (per user decision 2026-04-08): "lo más completo posible".
--
-- Storage budget: ~750 aircraft × 12 cron runs/h × 24h ≈ 216K rows/day.
-- A retention cleanup is run inside runMilitaryFlightsJob each cycle to
-- drop rows older than 30 days, keeping the table bounded around ~6M
-- rows max.
CREATE TABLE IF NOT EXISTS wm_military_flights (
  id                  BIGSERIAL PRIMARY KEY,
  icao24              TEXT NOT NULL,
  callsign            TEXT,
  aircraft_type       TEXT,
  aircraft_model      TEXT,
  operator            TEXT,
  operator_country    TEXT,
  lat                 DOUBLE PRECISION NOT NULL,
  lon                 DOUBLE PRECISION NOT NULL,
  altitude_ft         INTEGER,
  heading_deg         NUMERIC(6,2),
  speed_kt            INTEGER,
  vertical_rate_fpm   INTEGER,
  on_ground           BOOLEAN NOT NULL DEFAULT FALSE,
  squawk              TEXT,
  confidence          TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  is_interesting      BOOLEAN NOT NULL DEFAULT FALSE,
  hotspot             TEXT,
  note                TEXT,
  enriched            JSONB,
  raw                 JSONB,
  observed_at         TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_military_flights_obs_unique UNIQUE (icao24, observed_at)
);
CREATE INDEX IF NOT EXISTS idx_wm_mil_flights_observed
  ON wm_military_flights (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_mil_flights_icao24_observed
  ON wm_military_flights (icao24, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_mil_flights_operator
  ON wm_military_flights (operator)
  WHERE operator IS NOT NULL AND operator <> 'other';
CREATE INDEX IF NOT EXISTS idx_wm_mil_flights_hotspot
  ON wm_military_flights (hotspot, observed_at DESC)
  WHERE hotspot IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wm_mil_flights_interesting
  ON wm_military_flights (observed_at DESC)
  WHERE is_interesting = TRUE;

-- ─── Step 6: USNI Fleet Tracker reports (HTML scraping) ─────
-- ONE ROW PER weekly USNI report. UNIQUE on article_url so a re-run on
-- the same article is an UPDATE (refreshes parsed_at + vessels jsonb).
-- vessels jsonb is the full parsed array per report — kept inline rather
-- than normalized into a child table because the access pattern is
-- "show me the latest report" / "show me reports over time", not
-- "find every appearance of USS George Washington across history".
-- If/when normalized vessel queries become useful, we can derive a view.
CREATE TABLE IF NOT EXISTS wm_usni_fleet (
  id                    SERIAL PRIMARY KEY,
  article_url           TEXT NOT NULL UNIQUE,
  article_title         TEXT NOT NULL,
  article_date          DATE,
  total_battle_force    INTEGER,
  total_uss             INTEGER,
  total_usns            INTEGER,
  deployed              INTEGER,
  deployed_uss          INTEGER,
  deployed_usns         INTEGER,
  fdnf                  INTEGER,
  rotational            INTEGER,
  underway              INTEGER,
  underway_deployed     INTEGER,
  underway_local        INTEGER,
  vessel_count          INTEGER NOT NULL DEFAULT 0,
  region_count          INTEGER NOT NULL DEFAULT 0,
  vessels               JSONB,
  regions               JSONB,
  raw_battle_force      JSONB,
  parsed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_usni_article_date
  ON wm_usni_fleet (article_date DESC);
CREATE INDEX IF NOT EXISTS idx_wm_usni_last_seen
  ON wm_usni_fleet (last_seen DESC);

-- ─── Step 7: military vessels (AISstream WebSocket subscriber) ──
-- Mirrors src/worldmonitor/types/index.ts → MilitaryVessel.
-- ONE ROW PER (mmsi, observed_at) — historical snapshots, same shape as
-- wm_military_flights. The aisstream_subscriber.js maintains a live
-- in-memory Map of military-detected vessels (filtered via WM helpers
-- analyzeMmsi + matchKnownVessel) and the cron job runMilitaryVesselsJob
-- snapshots that Map every 5 minutes.
--
-- Storage budget: ~50-200 tracked vessels (chokepoint bboxes) × 12 cron
-- runs/h × 24h ≈ 60K rows/day max. Retention 30 days like flights →
-- ~1.8M rows max. Cleanup runs at the end of every cycle.
CREATE TABLE IF NOT EXISTS wm_military_vessels (
  id                  BIGSERIAL PRIMARY KEY,
  mmsi                TEXT NOT NULL,
  vessel_name         TEXT,
  vessel_type         TEXT,
  operator            TEXT,
  operator_country    TEXT,
  hull_number         TEXT,
  lat                 DOUBLE PRECISION NOT NULL,
  lon                 DOUBLE PRECISION NOT NULL,
  heading_deg         NUMERIC(6,2),
  speed_kt            NUMERIC(6,2),
  course_deg          NUMERIC(6,2),
  ais_ship_type       INTEGER,
  ais_ship_type_name  TEXT,
  is_dark             BOOLEAN NOT NULL DEFAULT FALSE,
  ais_gap_minutes     INTEGER,
  near_chokepoint     TEXT,
  near_base           TEXT,
  near_hotspot        TEXT,
  confidence          TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  raw                 JSONB,
  observed_at         TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_military_vessels_obs_unique UNIQUE (mmsi, observed_at)
);
CREATE INDEX IF NOT EXISTS idx_wm_mil_vessels_observed
  ON wm_military_vessels (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_mil_vessels_mmsi_observed
  ON wm_military_vessels (mmsi, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_mil_vessels_operator
  ON wm_military_vessels (operator)
  WHERE operator IS NOT NULL AND operator <> 'other';
CREATE INDEX IF NOT EXISTS idx_wm_mil_vessels_chokepoint
  ON wm_military_vessels (near_chokepoint, observed_at DESC)
  WHERE near_chokepoint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wm_mil_vessels_dark
  ON wm_military_vessels (observed_at DESC)
  WHERE is_dark = TRUE;

-- ─── Step 8: signal-aggregator output snapshots ─────────────
-- Mirrors src/worldmonitor/services/signal-aggregator.ts → SignalSummary.
-- One row per cron run (historical), so we can see how the geographic
-- signal landscape evolves over time. The aggregator itself is a
-- singleton in-memory; this table is the persisted observability layer.
--
-- Storage: 1 row per 5min cron = 288 rows/day = ~8.6K rows/month.
-- Trivial. Retention 30 days handled by cron cleanup inside the job.
CREATE TABLE IF NOT EXISTS wm_signal_summary (
  id                  BIGSERIAL PRIMARY KEY,
  total_signals       INTEGER NOT NULL DEFAULT 0,
  by_type             JSONB NOT NULL,
  top_countries       JSONB,
  convergence_zones   JSONB,
  ai_context          TEXT,
  flights_ingested    INTEGER NOT NULL DEFAULT 0,
  vessels_ingested    INTEGER NOT NULL DEFAULT 0,
  observed_at         TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_signal_summary_observed
  ON wm_signal_summary (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_signal_summary_total
  ON wm_signal_summary (total_signals DESC, observed_at DESC);

-- ─── Step 9: natural events (NASA EONET + GDACS, merged) ────
-- One row per (source, event_id). Same event re-fetched in next cron run
-- updates last_seen + closed status. EONET earthquakes are filtered out
-- in the WM service code (USGS provides better data); they only land in
-- wm_earthquakes below.
CREATE TABLE IF NOT EXISTS wm_natural_events (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL CHECK (source IN ('EONET','GDACS')),
  event_id        TEXT NOT NULL,
  category        TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  event_date      TIMESTAMPTZ,
  magnitude       NUMERIC(12,4),
  magnitude_unit  TEXT,
  alert_level     TEXT,
  country         TEXT,
  source_url      TEXT,
  source_name     TEXT,
  closed          BOOLEAN NOT NULL DEFAULT FALSE,
  raw             JSONB,
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_natural_events_unique UNIQUE (source, event_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_natural_events_last_seen
  ON wm_natural_events (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_wm_natural_events_category
  ON wm_natural_events (category, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_wm_natural_events_alert
  ON wm_natural_events (alert_level, last_seen DESC)
  WHERE alert_level IN ('Red','Orange');
CREATE INDEX IF NOT EXISTS idx_wm_natural_events_open
  ON wm_natural_events (last_seen DESC)
  WHERE closed = FALSE;

-- ─── Step 10: USGS earthquakes (direct GeoJSON feed) ────────
-- One row per USGS event_id. Re-fetching the same quake refreshes
-- felt/cdi/mmi/significance counts (those grow as more reports come in).
CREATE TABLE IF NOT EXISTS wm_earthquakes (
  id              BIGSERIAL PRIMARY KEY,
  usgs_id         TEXT NOT NULL UNIQUE,
  magnitude       NUMERIC(4,2) NOT NULL,
  place           TEXT,
  event_time      TIMESTAMPTZ NOT NULL,
  depth_km        NUMERIC(8,3),
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  event_type      TEXT,
  alert_level     TEXT,
  tsunami         BOOLEAN NOT NULL DEFAULT FALSE,
  felt            INTEGER,
  cdi             NUMERIC(4,2),
  mmi             NUMERIC(4,2),
  significance    INTEGER,
  url             TEXT,
  raw             JSONB,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_earthquakes_event_time
  ON wm_earthquakes (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_wm_earthquakes_magnitude
  ON wm_earthquakes (magnitude DESC, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_wm_earthquakes_alert
  ON wm_earthquakes (alert_level, event_time DESC)
  WHERE alert_level IN ('orange','red');
CREATE INDEX IF NOT EXISTS idx_wm_earthquakes_significance
  ON wm_earthquakes (significance DESC, event_time DESC)
  WHERE significance >= 600;

-- ─── Step 11: NASA FIRMS satellite fire detections ──────────
-- Historical snapshots — one row per detection. NASA FIRMS NRT data
-- updates every ~3-6 hours from the VIIRS_SNPP_NRT and MODIS_NRT
-- satellites. UNIQUE composite (lat, lon, acq_date, acq_time, satellite)
-- ensures the same fire pixel detected in the same satellite pass is
-- not duplicated across cron runs.
--
-- Storage budget: ~5K-50K detections/day globally → ~150K-1.5M rows/mo.
-- Bounded with retention 30 days cleanup in the cron.
CREATE TABLE IF NOT EXISTS wm_satellite_fires (
  id              BIGSERIAL PRIMARY KEY,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  bright_ti4      NUMERIC(7,2),
  bright_ti5      NUMERIC(7,2),
  scan            NUMERIC(5,2),
  track           NUMERIC(5,2),
  acq_date        DATE NOT NULL,
  acq_time        TEXT NOT NULL,
  satellite       TEXT NOT NULL,
  instrument      TEXT,
  confidence      TEXT,
  version         TEXT,
  frp             NUMERIC(10,2),
  daynight        TEXT,
  region          TEXT,
  raw             JSONB,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_satellite_fires_unique UNIQUE (lat, lon, acq_date, acq_time, satellite)
);
CREATE INDEX IF NOT EXISTS idx_wm_sat_fires_observed
  ON wm_satellite_fires (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_sat_fires_acq
  ON wm_satellite_fires (acq_date DESC, acq_time DESC);
CREATE INDEX IF NOT EXISTS idx_wm_sat_fires_high_intensity
  ON wm_satellite_fires (frp DESC, observed_at DESC)
  WHERE bright_ti4 > 360 AND confidence = 'h';
CREATE INDEX IF NOT EXISTS idx_wm_sat_fires_region
  ON wm_satellite_fires (region, observed_at DESC)
  WHERE region IS NOT NULL;

-- ─── Step 12: GDELT DOC 2.0 multi-topic intelligence feed ────
-- Replaces legacy gdelt-fetch (news_apis.fetchGdelt) which was alternating
-- between HTTP 429 and timeouts. New service iterates ~24 GDELT topic
-- queries (military, cyber, nuclear, sanctions, intelligence, maritime,
-- economy, climate, protests, terrorism, migration, energy, health,
-- technology, space, elections, diplomacy, trade, finance, disasters,
-- human_rights, food_security, water, ai_policy) with stagger + retry
-- backoff to stay under GDELT public rate limits.
--
-- One row per (topic_id, url). Same URL across topics keeps separate
-- rows because the topic axis is what consumers query on.
-- Retention 7 days — GDELT free tier window is 3 months but storage
-- bloat from 24 topics × 20 articles × every 30 min adds up fast.
CREATE TABLE IF NOT EXISTS wm_intel_articles (
  id            BIGSERIAL PRIMARY KEY,
  topic_id      TEXT NOT NULL,
  topic_name    TEXT NOT NULL,
  topic_icon    TEXT,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  source        TEXT,
  seendate      TIMESTAMPTZ,
  language      TEXT,
  tone          NUMERIC(6,2),
  image         TEXT,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_intel_articles_unique UNIQUE (topic_id, url)
);
CREATE INDEX IF NOT EXISTS idx_wm_intel_topic
  ON wm_intel_articles (topic_id, seendate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wm_intel_seendate
  ON wm_intel_articles (seendate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wm_intel_fetched
  ON wm_intel_articles (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_intel_high_tone
  ON wm_intel_articles (topic_id, ABS(tone) DESC, seendate DESC)
  WHERE tone IS NOT NULL;

-- ─── Step 13: Hotspot dynamic escalation scoring ─────────────
-- Computes a 1.0–5.0 escalation score per INTEL_HOTSPOT (27 total)
-- combining 4 components from already-populated WM tables:
--   newsActivity (35%) — wm_clusters keyword matches in 6h window
--   ciiContribution (25%) — wm_country_scores max for mapped countries
--   geoConvergence (25%) — wm_signal_summary convergence_zones nearby
--   militaryActivity (15%) — wm_military_flights+vessels in 200km radius
-- Blended with static baseline (escalationScore from TS catalog) at
-- 30/70 weights. Trend derived from delta vs ~24h ago.
--
-- One row per hotspot — UPSERT every cron run keeps the table compact.
-- A separate history table is intentionally NOT created here; the
-- 24h trend logic only needs the previous combined_score, which we
-- read from this table itself before overwriting.
CREATE TABLE IF NOT EXISTS wm_hotspot_escalation (
  hotspot_id           TEXT PRIMARY KEY,
  static_baseline      NUMERIC(3,1) NOT NULL,
  dynamic_score        NUMERIC(3,1) NOT NULL,
  combined_score       NUMERIC(3,1) NOT NULL,
  trend                TEXT NOT NULL,
  component_news       NUMERIC(5,2) NOT NULL DEFAULT 0,
  component_cii        NUMERIC(5,2) NOT NULL DEFAULT 0,
  component_geo        NUMERIC(5,2) NOT NULL DEFAULT 0,
  component_military   NUMERIC(5,2) NOT NULL DEFAULT 0,
  news_matches         INTEGER NOT NULL DEFAULT 0,
  cii_score            INTEGER,
  geo_zones_nearby     INTEGER NOT NULL DEFAULT 0,
  flights_nearby       INTEGER NOT NULL DEFAULT 0,
  vessels_nearby       INTEGER NOT NULL DEFAULT 0,
  prev_combined_score  NUMERIC(3,1),
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_hotspot_combined
  ON wm_hotspot_escalation (combined_score DESC);
CREATE INDEX IF NOT EXISTS idx_wm_hotspot_trend
  ON wm_hotspot_escalation (trend, combined_score DESC);
