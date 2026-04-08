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
