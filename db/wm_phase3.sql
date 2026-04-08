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
--  Bloque 2 (this commit):
--   - wm_energy_inventories → wm-energy-inventories cron (EIA v2 seriesid)
--   - wm_fx_rates           → wm-fx-rates cron (Frankfurter ECB ref rates)
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
