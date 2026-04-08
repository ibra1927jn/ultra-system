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
