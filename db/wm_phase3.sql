-- ════════════════════════════════════════════════════════════
--  WM Phase 3 — commodities/market verticals
--
--  Idempotent (IF NOT EXISTS). Safe to re-run on prod.
--  Tabla namespace: wm_*  (alineado con wm_phase2.sql)
--
--  Apply manually on prod:
--    docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB \
--      < /root/ultra-system/db/wm_phase3.sql
--
--  Bloque 1:
--   - wm_market_quotes  → wm-market-quotes cron (Yahoo v8 chart)
--   - wm_crypto_quotes  → wm-crypto-quotes cron (CoinGecko public API)
--
--  Bloque 2:
--   - wm_energy_inventories → wm-energy-inventories cron (EIA v2 seriesid)
--   - wm_fx_rates           → wm-fx-rates cron (Frankfurter ECB ref rates)
--
--  Bloque 3 (this commit):
--   - wm_macro_indicators   → wm-macro-indicators cron (FRED + World Bank)
--   - wm_agri_commodities   → wm-agri-commodities cron (USDA Quick Stats)
-- ════════════════════════════════════════════════════════════

-- ─── Step 14: Market quotes (stocks/sectors/indices/commodities) ──
-- Time-series append-only snapshots from Yahoo Finance v8 chart API.
-- One row per (symbol, observed_at). Catálogo en
-- ultra-engine/src/worldmonitor/config/markets.ts (~46 símbolos:
-- 12 sectors + 6 commodities + 28 stocks + indices major + ^VIX).
--
-- Storage budget:
--   ~46 symbols × 26 snapshots/day (15min during NY hours 9:30-16:00 ET, M-F)
--   = ~1200 rows/day → ~36K rows/mo. Bounded retention 90 días.
CREATE TABLE IF NOT EXISTS wm_market_quotes (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  display         TEXT,
  name            TEXT,
  category        TEXT NOT NULL,         -- 'sector' | 'commodity' | 'index' | 'stock'
  price           NUMERIC(14,4) NOT NULL,
  previous_close  NUMERIC(14,4),
  change_abs      NUMERIC(14,4),
  change_pct      NUMERIC(8,4),
  day_high        NUMERIC(14,4),
  day_low         NUMERIC(14,4),
  volume          BIGINT,
  currency        TEXT,
  exchange        TEXT,
  market_state    TEXT,                  -- 'REGULAR' | 'CLOSED' | 'PRE' | 'POST'
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_market_quotes_symbol_time
  ON wm_market_quotes (symbol, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_market_quotes_category_time
  ON wm_market_quotes (category, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_market_quotes_observed
  ON wm_market_quotes (observed_at DESC);
-- Big movers index — fast lookup of |change_pct| >= 3% in last day
CREATE INDEX IF NOT EXISTS idx_wm_market_quotes_movers
  ON wm_market_quotes (observed_at DESC, change_pct)
  WHERE change_pct IS NOT NULL AND ABS(change_pct) >= 3;

-- ─── Step 15: Crypto quotes (top coins + global market state) ──
-- Time-series append-only snapshots from CoinGecko public API
-- (no auth, ~10-30 req/min limit). One row per (coin_id, observed_at).
-- Includes per-coin stats AND a snapshot of global market cap and BTC
-- dominance — denormalized into every row so consumers don't need a
-- separate JOIN against a "global state" table.
--
-- Storage budget:
--   4 coins × 288 snapshots/day (5min, 24/7) = 1152 rows/day → ~35K rows/mo.
--   Retention 90 días.
CREATE TABLE IF NOT EXISTS wm_crypto_quotes (
  id                      BIGSERIAL PRIMARY KEY,
  coin_id                 TEXT NOT NULL,         -- coingecko id (bitcoin, ethereum, ...)
  symbol                  TEXT NOT NULL,         -- BTC / ETH / SOL / XRP
  name                    TEXT NOT NULL,
  price_usd               NUMERIC(20,8) NOT NULL,
  market_cap_usd          NUMERIC(20,2),
  volume_24h_usd          NUMERIC(20,2),
  change_1h_pct           NUMERIC(8,4),
  change_24h_pct          NUMERIC(8,4),
  change_7d_pct           NUMERIC(8,4),
  ath_usd                 NUMERIC(20,8),
  ath_change_pct          NUMERIC(8,4),
  circulating_supply      NUMERIC(24,2),
  -- Snapshot of global crypto market state (denormalized into every row).
  -- All rows from the same cron run share the same value here.
  global_market_cap_usd   NUMERIC(22,2),
  btc_dominance_pct       NUMERIC(7,4),
  active_cryptocurrencies INTEGER,
  observed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_crypto_quotes_coin_time
  ON wm_crypto_quotes (coin_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_crypto_quotes_observed
  ON wm_crypto_quotes (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_crypto_quotes_movers
  ON wm_crypto_quotes (observed_at DESC, change_24h_pct)
  WHERE change_24h_pct IS NOT NULL AND ABS(change_24h_pct) >= 5;

-- ─── Bloque 2 step 16: Energy inventories (EIA v2 seriesid) ────────
-- Weekly U.S. petroleum + natural gas storage levels. EIA publishes:
--   - Crude / Gasoline / Distillate: every Wed ~10:30 ET (post-holiday Thu)
--   - Natural gas working storage: every Thu ~10:30 ET
-- We poll daily 21:00 UTC; UPSERT (series_id, period) makes re-runs cheap
-- and idempotent — if today's report isn't out yet, the cron simply
-- re-confirms last week's values.
--
-- 4 series tracked (configurable in code):
--   PET.WCESTUS1.W            crude (excl. SPR)        — thousand barrels
--   PET.WGTSTUS1.W            total gasoline           — thousand barrels
--   PET.WDISTUS1.W            distillate fuel oil      — thousand barrels
--   NG.NW2_EPG0_SWO_R48_BCF.W natural gas Lower 48     — billion cubic feet
--
-- Storage: ~4 series × ~52 weeks/year = ~200 rows/year. No retention
-- pruning — full history fits trivially.
CREATE TABLE IF NOT EXISTS wm_energy_inventories (
  id              BIGSERIAL PRIMARY KEY,
  series_id       TEXT NOT NULL,                   -- 'PET.WCESTUS1.W'
  category        TEXT NOT NULL,                   -- 'crude' | 'gasoline' | 'distillate' | 'natgas'
  display         TEXT NOT NULL,                   -- short label
  description     TEXT,                            -- EIA series-description
  period          DATE NOT NULL,                   -- week-ending date from EIA
  value           NUMERIC(18,4) NOT NULL,          -- inventory level
  unit            TEXT NOT NULL,                   -- 'MBBL' | 'BCF'
  prev_value      NUMERIC(18,4),                   -- previous week
  change_abs      NUMERIC(18,4),
  change_pct      NUMERIC(8,4),
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_energy_inv_uniq UNIQUE (series_id, period)
);
CREATE INDEX IF NOT EXISTS idx_wm_energy_inv_series_period
  ON wm_energy_inventories (series_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_wm_energy_inv_category_period
  ON wm_energy_inventories (category, period DESC);
CREATE INDEX IF NOT EXISTS idx_wm_energy_inv_period
  ON wm_energy_inventories (period DESC);

-- ─── Bloque 2 step 17: FX rates (Frankfurter / ECB ref rates) ──────
-- Daily ECB reference rates against USD base. Frankfurter is a free
-- public mirror of ECB Statistical Data Warehouse — no auth, no key.
-- Pulls 18 majors. UPSERT (base, quote, rate_date) keeps one row per
-- pair per day; re-runs on the same day are no-ops. Cleanup retention
-- 730 días en wm_bridge.js para mantener tabla bounded.
--
-- Storage: 18 pairs × 365 days/year ≈ 6.6K rows/year → ~13K rows over
-- 2 años de retention. Trivial.
CREATE TABLE IF NOT EXISTS wm_fx_rates (
  id              BIGSERIAL PRIMARY KEY,
  base            TEXT NOT NULL,                   -- 'USD'
  quote           TEXT NOT NULL,                   -- 'EUR' / 'GBP' / ...
  rate            NUMERIC(20,8) NOT NULL,          -- units of quote per 1 base
  rate_date       DATE NOT NULL,                   -- ECB publication date
  prev_rate       NUMERIC(20,8),                   -- last known prior rate
  prev_date       DATE,                            -- date of prev_rate
  change_abs      NUMERIC(20,8),
  change_pct      NUMERIC(8,4),
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_fx_rates_uniq UNIQUE (base, quote, rate_date)
);
CREATE INDEX IF NOT EXISTS idx_wm_fx_rates_pair_date
  ON wm_fx_rates (base, quote, rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_wm_fx_rates_date
  ON wm_fx_rates (rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_wm_fx_rates_movers
  ON wm_fx_rates (rate_date DESC, change_pct)
  WHERE change_pct IS NOT NULL AND ABS(change_pct) >= 1;

-- ─── Bloque 3 step 18: Macro indicators (FRED + World Bank) ────────
-- Unified time-series store across two macro data sources:
--   - FRED (api.stlouisfed.org): US daily/weekly/monthly time-series
--     covering rates, yield curve, inflation, liquidity, credit, recession
--   - World Bank (api.worldbank.org): annual world/country indicators
--     for slow-moving structural context (GDP growth, inflation, unemployment)
--
-- One row per (source, indicator_id, area, period). UPSERT idempotent —
-- the cron can re-fetch the same observations without duplicating. Each
-- row precomputes prev_value / change_abs / change_pct vs the prior
-- observation in the same series so consumers don't need window functions.
--
-- Storage: ~15 series × ~50 obs/year = ~750 rows/year. Sin retention.
CREATE TABLE IF NOT EXISTS wm_macro_indicators (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,                   -- 'FRED' | 'WORLD_BANK'
  indicator_id    TEXT NOT NULL,                   -- 'DFF' / 'NY.GDP.MKTP.KD.ZG'
  display         TEXT NOT NULL,                   -- short label
  category        TEXT NOT NULL,                   -- rates|inflation|employment|liquidity|recession|growth|credit
  area            TEXT NOT NULL,                   -- 'US' | 'WLD'
  frequency       TEXT NOT NULL,                   -- daily|weekly|monthly|quarterly|annual
  period          DATE NOT NULL,                   -- observation date
  value           NUMERIC(22,6) NOT NULL,
  unit            TEXT,                            -- '%' / 'index' / 'USD' / 'BCF' ...
  prev_value      NUMERIC(22,6),
  prev_period     DATE,
  change_abs      NUMERIC(22,6),
  change_pct      NUMERIC(12,4),
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_macro_uniq UNIQUE (source, indicator_id, area, period)
);
CREATE INDEX IF NOT EXISTS idx_wm_macro_indicator_period
  ON wm_macro_indicators (indicator_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_wm_macro_category_period
  ON wm_macro_indicators (category, period DESC);
CREATE INDEX IF NOT EXISTS idx_wm_macro_period
  ON wm_macro_indicators (period DESC);
CREATE INDEX IF NOT EXISTS idx_wm_macro_source_area
  ON wm_macro_indicators (source, area);

-- ─── Bloque 3 step 19: Agri commodities (USDA Quick Stats / NASS) ──
-- US National annual production for the 5 anchor crops. USDA NASS
-- Quick Stats API. v1 tracks annual PRODUCTION in physical unit only;
-- weekly crop progress and monthly stocks come in a future expansion.
--
-- Tracked commodities (commodity / unit):
--   CORN     — BU            (filter unit_desc=BU + util_practice_desc=GRAIN)
--   SOYBEANS — BU            (filter unit_desc=BU)
--   WHEAT    — BU            (filter unit_desc=BU)
--   COTTON   — 480 LB BALES  (filter unit_desc='480 LB BALES')
--   RICE     — CWT           (filter unit_desc=CWT)
--
-- USDA returns multiple rows per (commodity, year): we filter to the
-- "ALL CLASSES" + reference_period_desc='YEAR' final value in the
-- canonical unit. UPSERT por (commodity, metric, area, period) —
-- cron weekly is essentially a re-confirm in most weeks.
--
-- Storage: ~5 commodities × ~10 years history = ~50 rows total. Trivial.
CREATE TABLE IF NOT EXISTS wm_agri_commodities (
  id              BIGSERIAL PRIMARY KEY,
  commodity       TEXT NOT NULL,                   -- 'CORN'
  category        TEXT NOT NULL,                   -- 'grain'|'oilseed'|'fiber'
  metric          TEXT NOT NULL,                   -- 'PRODUCTION'
  display         TEXT NOT NULL,                   -- 'US Corn Production'
  short_desc      TEXT,                            -- USDA short_desc
  area            TEXT NOT NULL,                   -- 'US'
  period          DATE NOT NULL,                   -- year as YYYY-12-31
  reference       TEXT,                            -- USDA reference_period_desc
  value           NUMERIC(24,4) NOT NULL,
  unit            TEXT NOT NULL,                   -- 'BU' | 'CWT' | '480 LB BALES'
  prev_value      NUMERIC(24,4),
  prev_period     DATE,
  change_abs      NUMERIC(24,4),
  change_pct      NUMERIC(10,4),
  load_time       TIMESTAMPTZ,                     -- USDA load_time
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_agri_uniq UNIQUE (commodity, metric, area, period)
);
CREATE INDEX IF NOT EXISTS idx_wm_agri_commodity_period
  ON wm_agri_commodities (commodity, period DESC);
CREATE INDEX IF NOT EXISTS idx_wm_agri_category_period
  ON wm_agri_commodities (category, period DESC);
CREATE INDEX IF NOT EXISTS idx_wm_agri_period
  ON wm_agri_commodities (period DESC);

-- ─── Bloque 4 step 20: Prediction markets (unified) ────────────────
-- Single table for prediction-market signals across multiple sources
-- (Manifold / Kalshi / Metaculus / Polymarket). 90% of the semantics
-- is shared; per-source quirks live in `outcomes` jsonb + `currency`
-- (Manifold uses MANA play-money, Kalshi/Polymarket USD, Metaculus
-- uses calibrated points + CDFs for continuous questions).
--
-- Time-series of prices/probabilities lives in the child table
-- wm_prediction_market_snapshots — one append-only row per cron tick
-- per market. Keeps the parent row small while preserving full history
-- for the intelligence layer (correlation, divergence, regime shifts).
--
-- UPSERT key: (source, source_market_id) — native id from each source.
--
-- Storage budget Sub 4a (Manifold only): ~200 active markets × 48
-- snapshots/day (cron */30) ≈ 10K rows/day → ~300K/mo. Bounded
-- retention TBD when 4b/4c/4d add their volume.
CREATE TABLE IF NOT EXISTS wm_prediction_markets (
  id                BIGSERIAL PRIMARY KEY,
  source            TEXT NOT NULL,                    -- 'manifold'|'kalshi'|'metaculus'|'polymarket'
  source_market_id  TEXT NOT NULL,                    -- native id from source
  source_event_id   TEXT,                             -- nullable (Polymarket events, Kalshi events)
  slug              TEXT,
  url               TEXT,
  question          TEXT NOT NULL,
  description       TEXT,
  category          TEXT[] NOT NULL DEFAULT '{}',     -- normalized: politics|geopolitics|elections|macro|ai|science|biosec|crypto|tech|other
  raw_tags          TEXT[] NOT NULL DEFAULT '{}',     -- source-native tags untouched
  market_type       TEXT NOT NULL,                    -- 'binary'|'multiple_choice'|'scalar'|'continuous_cdf'
  outcomes          JSONB,                            -- [{label, probability?, volume?}] — null for unknown shape
  probability       NUMERIC(8,6),                     -- canonical YES probability for binary, null otherwise
  volume            NUMERIC(20,4),                    -- in `currency` units (MANA/USD/PTS)
  liquidity         NUMERIC(20,4),
  open_interest     NUMERIC(20,4),
  currency          TEXT NOT NULL,                    -- 'USD'|'MANA'|'PTS'
  trader_count      INTEGER,
  opened_at         TIMESTAMPTZ,
  closes_at         TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  resolution        TEXT,
  resolution_source TEXT,
  status            TEXT NOT NULL,                    -- 'open'|'closed'|'resolved'|'cancelled'
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw               JSONB,                            -- full source payload for reprocessing
  CONSTRAINT wm_prediction_markets_uniq UNIQUE (source, source_market_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_pred_source_fetched
  ON wm_prediction_markets (source, last_fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_pred_closes_open
  ON wm_prediction_markets (closes_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_wm_pred_category
  ON wm_prediction_markets USING GIN (category);
CREATE INDEX IF NOT EXISTS idx_wm_pred_raw_tags
  ON wm_prediction_markets USING GIN (raw_tags);

CREATE TABLE IF NOT EXISTS wm_prediction_market_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  market_id     BIGINT NOT NULL REFERENCES wm_prediction_markets(id) ON DELETE CASCADE,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  probability   NUMERIC(8,6),
  outcomes      JSONB,
  volume        NUMERIC(20,4),
  liquidity     NUMERIC(20,4)
);
CREATE INDEX IF NOT EXISTS idx_wm_pred_snap_market_time
  ON wm_prediction_market_snapshots (market_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_pred_snap_captured
  ON wm_prediction_market_snapshots (captured_at DESC);

-- ════════════════════════════════════════════════════════════
--  Bloque 5 — cyber + infrastructure + commercial transport + correlation
--
--  Sub-A: cyber CVEs (NIST NVD 2.0 + CISA KEV catalog)
--  Sub-B: internet outages (Cloudflare Radar API)
--  Sub-D: commercial flights (OpenSky direct, non-military)
--  Sub-D: commercial vessels (AISStream fan-out, cargo/tanker)
--  Phase 2 closure: correlation signals (server-side runner)
-- ════════════════════════════════════════════════════════════

-- ─── Bloque 5 step 21: Cyber CVEs (NVD 2.0 + CISA KEV) ─────────────
-- One row per CVE id. NVD 2.0 API provides incremental updates via
-- lastModStartDate; we keep the latest known state per CVE (UPSERT).
-- Filter: store CVEs with cvss_score ≥ 7.0 OR kev_flag = true. The
-- KEV (Known Exploited Vulnerabilities) flag comes from the CISA KEV
-- catalog (separate JSON, ~1300 entries) which we re-merge on every
-- fetch — KEV state can transition false → true when CISA adds the
-- CVE retroactively.
--
-- Storage: ~1500 KEV-tagged + ~3000 CVSS≥7 published in last 30d on
-- first run, then deltas only. Bounded retention 365d on published_at.
CREATE TABLE IF NOT EXISTS wm_cyber_cves (
  id              BIGSERIAL PRIMARY KEY,
  cve_id          TEXT NOT NULL,                   -- 'CVE-2026-12345'
  source          TEXT NOT NULL,                   -- 'NVD'
  published_at    TIMESTAMPTZ NOT NULL,            -- NVD published
  last_modified   TIMESTAMPTZ NOT NULL,            -- NVD lastModified
  cvss_version    TEXT,                            -- 'v3.1' / 'v3.0' / 'v2'
  cvss_score      NUMERIC(4,1),                    -- 0.0 - 10.0
  cvss_severity   TEXT,                            -- LOW|MEDIUM|HIGH|CRITICAL
  cvss_vector     TEXT,
  kev_flag        BOOLEAN NOT NULL DEFAULT FALSE,  -- in CISA KEV catalog
  kev_added_date  DATE,                            -- date added to KEV
  kev_due_date    DATE,                            -- KEV remediation due
  vendors         TEXT[] NOT NULL DEFAULT '{}',    -- normalized vendor names
  products        TEXT[] NOT NULL DEFAULT '{}',    -- normalized product names
  cwe_ids         TEXT[] NOT NULL DEFAULT '{}',    -- CWE-79, CWE-89, ...
  description     TEXT,
  reference_count INTEGER,                         -- # of references
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw             JSONB,                           -- truncated NVD payload
  CONSTRAINT wm_cyber_cves_uniq UNIQUE (cve_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_cyber_cves_published
  ON wm_cyber_cves (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_cyber_cves_modified
  ON wm_cyber_cves (last_modified DESC);
CREATE INDEX IF NOT EXISTS idx_wm_cyber_cves_severity
  ON wm_cyber_cves (cvss_severity, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_cyber_cves_kev
  ON wm_cyber_cves (kev_flag, kev_added_date DESC) WHERE kev_flag = TRUE;
CREATE INDEX IF NOT EXISTS idx_wm_cyber_cves_vendors
  ON wm_cyber_cves USING GIN (vendors);
CREATE INDEX IF NOT EXISTS idx_wm_cyber_cves_products
  ON wm_cyber_cves USING GIN (products);

-- ─── Bloque 5 step 22: Internet outages (Cloudflare Radar) ─────────
-- Country/network-level connectivity disruptions detected by
-- Cloudflare Radar. Endpoint: GET /radar/annotations/outages with
-- bearer CLOUDFLARE_RADAR_TOKEN. UPSERT por id (Cloudflare's stable
-- annotation id). Each outage row spans a (start_date, end_date)
-- window — re-runs update end_date when CF closes the annotation.
--
-- Storage: ~50-200 active outages globally at any time, ~1-5K/year
-- of historical entries. Sin retention pruning.
CREATE TABLE IF NOT EXISTS wm_internet_outages (
  id              BIGSERIAL PRIMARY KEY,
  source_id       TEXT NOT NULL,                   -- Cloudflare annotation id
  outage_type     TEXT,                            -- 'INTERNET-OUTAGE' | etc
  scope           TEXT,                            -- 'country' | 'network'
  location_code   TEXT,                            -- ISO country code
  location_name   TEXT,
  asn             TEXT,                            -- network outages
  asn_name        TEXT,
  event_type      TEXT,                            -- govt-directed | technical | unknown
  description     TEXT,
  link_url        TEXT,
  start_date      TIMESTAMPTZ NOT NULL,
  end_date        TIMESTAMPTZ,                     -- null = ongoing
  is_ongoing      BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw             JSONB,
  CONSTRAINT wm_internet_outages_uniq UNIQUE (source_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_outages_start
  ON wm_internet_outages (start_date DESC);
CREATE INDEX IF NOT EXISTS idx_wm_outages_country
  ON wm_internet_outages (location_code, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_wm_outages_ongoing
  ON wm_internet_outages (is_ongoing, start_date DESC) WHERE is_ongoing = TRUE;

-- ─── Bloque 5 step 23: Commercial flights (OpenSky non-military) ───
-- Snapshot of commercial aircraft positions from OpenSky /api/states/all
-- over a wide bbox set covering NA / EU / Asia airspace. We filter OUT
-- military flights (already covered by wm_military_flights) and sample
-- to bound the dataset. Each cron tick is one (icao24, observed_at)
-- snapshot — append-only, bounded retention 7 días.
--
-- Storage: ~2-5K rows/snapshot × 4 snapshots/h × 24h × 7d ≈ 1-3M rows
-- max, manageable with the time-bounded indexes.
CREATE TABLE IF NOT EXISTS wm_commercial_flights (
  id              BIGSERIAL PRIMARY KEY,
  icao24          TEXT NOT NULL,
  callsign        TEXT,
  origin_country  TEXT,
  lat             NUMERIC(9,6) NOT NULL,
  lon             NUMERIC(9,6) NOT NULL,
  altitude_ft     INTEGER,
  heading_deg     NUMERIC(6,2),
  speed_kt        INTEGER,
  vertical_rate_fpm INTEGER,
  on_ground       BOOLEAN,
  squawk          TEXT,
  region          TEXT,                            -- 'na'|'eu'|'apac'|'mena'|'oceania'|'sa'
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_commercial_flights_uniq UNIQUE (icao24, observed_at)
);
CREATE INDEX IF NOT EXISTS idx_wm_comm_flights_observed
  ON wm_commercial_flights (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_comm_flights_region_obs
  ON wm_commercial_flights (region, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_comm_flights_callsign
  ON wm_commercial_flights (callsign) WHERE callsign IS NOT NULL;

-- ─── Bloque 5 step 24: Commercial vessels (AISStream fan-out) ──────
-- Snapshot of commercial vessels (cargo / tanker AIS ship types) seen
-- by the AISStream WebSocket subscriber. The subscriber fans out each
-- AIS message to BOTH military-vessels.processAisPosition (existing)
-- AND commercial-vessels.processCommercialAisPosition (new). The
-- commercial track keeps an in-memory map filtered to ship types
-- 70-89 (cargo / tanker). Cron snapshots the map periodically.
--
-- Storage: ~200-2000 tracked vessels × 4 snapshots/h × 24h × 7d ≈
-- 100K-1.4M rows max. Bounded retention 7 días.
CREATE TABLE IF NOT EXISTS wm_commercial_vessels (
  id              BIGSERIAL PRIMARY KEY,
  mmsi            TEXT NOT NULL,
  vessel_name     TEXT,
  ais_ship_type   INTEGER,                         -- 70-79 cargo, 80-89 tanker
  ais_ship_type_name TEXT,                         -- 'Cargo' | 'Tanker' | ...
  category        TEXT NOT NULL,                   -- 'cargo' | 'tanker' | 'other'
  flag_country    TEXT,
  lat             NUMERIC(9,6) NOT NULL,
  lon             NUMERIC(9,6) NOT NULL,
  heading_deg     NUMERIC(6,2),
  speed_kt        NUMERIC(6,2),
  course_deg      NUMERIC(6,2),
  destination     TEXT,
  near_chokepoint TEXT,                            -- chokepoint name if inside bbox
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wm_commercial_vessels_uniq UNIQUE (mmsi, observed_at)
);
CREATE INDEX IF NOT EXISTS idx_wm_comm_vessels_observed
  ON wm_commercial_vessels (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_comm_vessels_category_obs
  ON wm_commercial_vessels (category, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_comm_vessels_chokepoint
  ON wm_commercial_vessels (near_chokepoint, observed_at DESC)
  WHERE near_chokepoint IS NOT NULL;

-- ─── Bloque 5 step 25: Correlation signals (Phase 2 closure) ───────
-- Server-side correlation runner. Reads recent rows from:
--   - wm_market_quotes / wm_crypto_quotes / wm_fx_rates  (price moves)
--   - wm_prediction_markets + wm_prediction_market_snapshots (prob shifts)
--   - wm_intel_articles                                  (news velocity)
-- and emits CorrelationSignal rows when mechanical thresholds are
-- crossed. Designed as a NEW path independent of the in-memory
-- analyzeCorrelationsCore() which expects a different shape.
--
-- Signal types (Bloque 5 v1, expand later):
--   - prediction_swing      |Δp| ≥ 5pp in last ~60min for a market
--   - market_move           |change_pct| ≥ 3% on a stock/sector/index
--   - crypto_move           |change_24h| ≥ 5% on top4 crypto
--   - fx_move               |change_pct| ≥ 1% on a major pair
--   - cve_critical          new CVE published with cvss ≥ 9.0 OR kev=true
--   - outage_started        new internet outage row (govt-directed flagged)
--
-- One row per (signal_type, entity_key, fired_at). Dedup at the
-- runner level by recent (signal_type, entity_key) lookup so we don't
-- spam every cron tick.
--
-- Storage: ~50-500 signals/day. Bounded retention 90 días.
CREATE TABLE IF NOT EXISTS wm_correlation_signals (
  id              BIGSERIAL PRIMARY KEY,
  signal_type     TEXT NOT NULL,
  entity_key      TEXT NOT NULL,                   -- 'symbol:^VIX' / 'pred:polymarket:abc' / 'cve:CVE-...' / 'outage:cf:...'
  title           TEXT NOT NULL,
  description     TEXT,
  confidence      NUMERIC(4,3) NOT NULL,           -- 0.0 - 1.0
  magnitude       NUMERIC(12,4),                   -- |Δ| of the underlying move
  baseline        NUMERIC(12,4),
  observed        NUMERIC(12,4),
  related         JSONB,                           -- {related_news:[], related_markets:[], ...}
  raw             JSONB,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wm_corr_fired
  ON wm_correlation_signals (fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_corr_type_fired
  ON wm_correlation_signals (signal_type, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_corr_entity
  ON wm_correlation_signals (entity_key, fired_at DESC);
