#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — Migración Fase 2 (idempotente)          ║
# ║  Aplica todos los cambios de schema introducidos en      ║
# ║  Fase 2 sobre la DB existente. Safe to re-run.           ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

source .env
PG="docker compose exec -T db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}"

echo "🔄 Aplicando migración Fase 2..."

$PG <<'SQL'
-- ════════════════════════════════════════════════════════════
--  P4 FASE 2 — Schengen + passport-index
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bur_travel_log (
    id              SERIAL PRIMARY KEY,
    country         VARCHAR(2) NOT NULL,
    area            VARCHAR(20),
    entry_date      DATE NOT NULL,
    exit_date       DATE,
    purpose         VARCHAR(50),
    passport_used   VARCHAR(2),
    notes           TEXT,
    source          VARCHAR(20) DEFAULT 'manual',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (exit_date IS NULL OR exit_date >= entry_date)
);
CREATE INDEX IF NOT EXISTS idx_travel_country ON bur_travel_log(country);
CREATE INDEX IF NOT EXISTS idx_travel_area ON bur_travel_log(area);
CREATE INDEX IF NOT EXISTS idx_travel_entry ON bur_travel_log(entry_date);
CREATE INDEX IF NOT EXISTS idx_travel_exit ON bur_travel_log(exit_date);

CREATE TABLE IF NOT EXISTS bur_visa_matrix (
    id              SERIAL PRIMARY KEY,
    passport        VARCHAR(2) NOT NULL,
    destination     VARCHAR(2) NOT NULL,
    requirement     VARCHAR(30) NOT NULL,
    days_allowed    INTEGER,
    notes           TEXT,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (passport, destination)
);
CREATE INDEX IF NOT EXISTS idx_visa_passport ON bur_visa_matrix(passport);
CREATE INDEX IF NOT EXISTS idx_visa_destination ON bur_visa_matrix(destination);

-- ════════════════════════════════════════════════════════════
--  P4 FASE 2 — changedetection.io watches
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bur_gov_watches (
    id              SERIAL PRIMARY KEY,
    label           VARCHAR(200) NOT NULL,
    url             TEXT NOT NULL,
    country         VARCHAR(2),
    category        VARCHAR(50),
    cdio_uuid       VARCHAR(80),
    is_active       BOOLEAN DEFAULT TRUE,
    last_changed_at TIMESTAMP,
    last_check_at   TIMESTAMP,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (url)
);
CREATE INDEX IF NOT EXISTS idx_gov_watches_country ON bur_gov_watches(country);
CREATE INDEX IF NOT EXISTS idx_gov_watches_active ON bur_gov_watches(is_active);

CREATE TABLE IF NOT EXISTS bur_gov_changes (
    id              SERIAL PRIMARY KEY,
    watch_id        INTEGER REFERENCES bur_gov_watches(id) ON DELETE SET NULL,
    cdio_uuid       VARCHAR(80),
    detected_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    diff_summary    TEXT,
    payload         JSONB
);
CREATE INDEX IF NOT EXISTS idx_gov_changes_detected ON bur_gov_changes(detected_at DESC);

-- ════════════════════════════════════════════════════════════
--  P3 FASE 2 — savings goals + crypto + recurring extension
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fin_savings_goals (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    target_amount   NUMERIC(14, 2) NOT NULL,
    current_amount  NUMERIC(14, 2) DEFAULT 0,
    currency        VARCHAR(3) DEFAULT 'NZD',
    target_date     DATE,
    category        VARCHAR(50),
    is_active       BOOLEAN DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_savings_active ON fin_savings_goals(is_active);
CREATE INDEX IF NOT EXISTS idx_savings_target ON fin_savings_goals(target_date);

DO $$ BEGIN ALTER TABLE fin_recurring ADD COLUMN confidence NUMERIC(3,2); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE fin_recurring ADD COLUMN sample_size INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE fin_recurring ADD COLUMN avg_interval_days NUMERIC(6,2); EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE TABLE IF NOT EXISTS fin_crypto_holdings (
    id              SERIAL PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL,
    amount          NUMERIC(24, 8) NOT NULL,
    exchange        VARCHAR(50) NOT NULL,
    wallet_address  VARCHAR(200),
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (symbol, exchange)
);
CREATE INDEX IF NOT EXISTS idx_crypto_active ON fin_crypto_holdings(is_active);
CREATE INDEX IF NOT EXISTS idx_crypto_exchange ON fin_crypto_holdings(exchange);

-- ════════════════════════════════════════════════════════════
--  P5 FASE 2 — emp_profile (puede preexistir con cols viejas)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS emp_profile (
    id              SERIAL PRIMARY KEY,
    skills          JSONB DEFAULT '[]'::jsonb,
    languages       JSONB DEFAULT '[]'::jsonb,
    experience      JSONB DEFAULT '[]'::jsonb,
    preferred_countries TEXT[],
    preferred_sectors   TEXT[],
    min_salary_nzd  NUMERIC(10, 2),
    preferences     JSONB DEFAULT '{}'::jsonb,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN ALTER TABLE emp_profile ADD COLUMN preferred_countries TEXT[]; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE emp_profile ADD COLUMN preferred_sectors TEXT[]; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE emp_profile ADD COLUMN min_salary_nzd NUMERIC(10,2); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE emp_profile ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE emp_profile ADD COLUMN experience JSONB DEFAULT '[]'::jsonb; EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Migrar skills/languages text[] → jsonb (idempotente: skip si ya es jsonb)
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='emp_profile' AND column_name='skills') = 'ARRAY' THEN
    ALTER TABLE emp_profile ALTER COLUMN skills DROP DEFAULT;
    ALTER TABLE emp_profile ALTER COLUMN skills TYPE JSONB USING to_jsonb(skills);
    ALTER TABLE emp_profile ALTER COLUMN skills SET DEFAULT '[]'::jsonb;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='emp_profile' AND column_name='languages') = 'ARRAY' THEN
    ALTER TABLE emp_profile ALTER COLUMN languages DROP DEFAULT;
    ALTER TABLE emp_profile ALTER COLUMN languages TYPE JSONB USING to_jsonb(languages);
    ALTER TABLE emp_profile ALTER COLUMN languages SET DEFAULT '[]'::jsonb;
  END IF;
END $$;

INSERT INTO emp_profile (id, skills, languages, preferred_countries, preferred_sectors, min_salary_nzd, preferences)
VALUES (
    1,
    '["nodejs","javascript","typescript","python","postgres","docker","linux","react","express","ai","llm","devops","bash","sql","git","ai_agents","claude","openai"]'::jsonb,
    '[{"lang":"es","level":"native"},{"lang":"en","level":"C2"},{"lang":"fr","level":"B2"},{"lang":"ar","level":"B1"}]'::jsonb,
    ARRAY['NZ','AU','ES','CA','GB','PT','DE'],
    ARRAY['ai','devtools','fintech','aerospace','biotech','dev','engineering'],
    65000,
    '{"remote_ok":true,"visa_sponsor_preferred":true,"van_life_compatible":true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
--  P2 FASE 2 — visa sponsors register
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS emp_visa_sponsors (
    id              SERIAL PRIMARY KEY,
    country         VARCHAR(2) NOT NULL,
    company_name    VARCHAR(200) NOT NULL,
    city            VARCHAR(100),
    region          VARCHAR(100),
    route           VARCHAR(100),
    rating          VARCHAR(100),
    source          VARCHAR(40) NOT NULL,
    imported_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (country, company_name)
);
CREATE INDEX IF NOT EXISTS idx_visa_sponsors_country ON emp_visa_sponsors(country);
CREATE INDEX IF NOT EXISTS idx_visa_sponsors_name_lower ON emp_visa_sponsors(LOWER(company_name));

-- ════════════════════════════════════════════════════════════
--  P1 FASE 2 — events_store + dedup columns
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events_store (
    id              SERIAL PRIMARY KEY,
    source          VARCHAR(30) NOT NULL,
    external_id     VARCHAR(200),
    event_type      VARCHAR(50),
    severity        VARCHAR(20),
    title           VARCHAR(500),
    summary         TEXT,
    country         VARCHAR(2),
    region          VARCHAR(100),
    latitude        NUMERIC(8, 5),
    longitude       NUMERIC(9, 5),
    magnitude       NUMERIC(6, 2),
    occurred_at     TIMESTAMP,
    url             TEXT,
    payload         JSONB,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_events_country ON events_store(country);
CREATE INDEX IF NOT EXISTS idx_events_source ON events_store(source);
CREATE INDEX IF NOT EXISTS idx_events_type ON events_store(event_type);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON events_store(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events_store(severity);

DO $$ BEGIN ALTER TABLE rss_articles ADD COLUMN duplicate_of INTEGER REFERENCES rss_articles(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE rss_articles ADD COLUMN dedup_similarity NUMERIC(4,3); EXCEPTION WHEN duplicate_column THEN null; END $$;
CREATE INDEX IF NOT EXISTS idx_rss_dup ON rss_articles(duplicate_of);

DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN duplicate_of INTEGER REFERENCES opportunities(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN dedup_similarity NUMERIC(4,3); EXCEPTION WHEN duplicate_column THEN null; END $$;
CREATE INDEX IF NOT EXISTS idx_opps_dup ON opportunities(duplicate_of);

DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN duplicate_of INTEGER REFERENCES job_listings(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN dedup_similarity NUMERIC(4,3); EXCEPTION WHEN duplicate_column THEN null; END $$;
CREATE INDEX IF NOT EXISTS idx_jobs_dup ON job_listings(duplicate_of);

SELECT 'Migración Fase 2 aplicada' AS status;
SQL

echo ""
echo "✅ Migración aplicada. Ahora aplicando seeds visa matrix + gov watches..."

# Los seeds van aparte porque son largos — extraer del init.sql
# Aplicamos solo las partes INSERT idempotentes (con ON CONFLICT)

# Visa matrix seed
$PG <<'SQL'
INSERT INTO bur_visa_matrix (passport, destination, requirement, days_allowed, notes) VALUES
    ('ES', 'NZ', 'eta', 90, 'NZeTA NZD$23 + IVL $100 — válida 2 años. Visa-free 90 días'),
    ('ES', 'AU', 'e-visa', 90, 'eVisitor (subclass 651) FREE — válido 12 meses'),
    ('ES', 'GB', 'visa free', 180, 'UK 6 months tourism since Brexit'),
    ('DZ', 'NZ', 'visa required', NULL, 'Visitor visa NZD$211'),
    ('DZ', 'AU', 'visa required', NULL, 'Subclass 600 visitor visa'),
    ('DZ', 'GB', 'visa required', NULL, 'UK Standard Visitor Visa £127'),
    ('DZ', 'FR', 'visa required', NULL, 'Schengen visa needed'),
    ('DZ', 'TN', 'visa free', 90, 'Maghreb — visa free'),
    ('DZ', 'MA', 'visa free', 90, 'Maghreb — visa free'),
    ('DZ', 'TR', 'visa free', 90, '90/180')
ON CONFLICT (passport, destination) DO NOTHING;

INSERT INTO bur_gov_watches (label, url, country, category, notes) VALUES
    ('NZ Immigration — Working Holiday', 'https://www.immigration.govt.nz/new-zealand-visas/options/work/thinking-about-coming-to-new-zealand-to-work/working-holiday-visa', 'NZ', 'visa', 'Cambios en condiciones WHV'),
    ('NZ Immigration — Spain WHV', 'https://www.immigration.govt.nz/new-zealand-visas/apply-for-a-visa/about-visa/spain-working-holiday-visa', 'NZ', 'visa', 'WHV específico ES'),
    ('AU Immigration — Working Holiday', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'AU', 'visa', 'Subclass 417 WHV'),
    ('Schengen Visa Info', 'https://www.schengenvisainfo.com/news/', NULL, 'visa', 'Cambios reglas Schengen'),
    ('AEAT — Modelo 720/721', 'https://sede.agenciatributaria.gob.es/Sede/declaraciones-informativas/declaracion-bienes-derechos-extranjero-modelo-720.html', 'ES', 'tax', 'Modelo 720 deadline'),
    ('NZTA Self-Contained Vehicle', 'https://www.nzta.govt.nz/vehicles/vehicle-types/light-vehicles/self-contained-vehicles/', 'NZ', 'visa', 'Green warrant van rules')
ON CONFLICT (url) DO NOTHING;

SELECT
  (SELECT COUNT(*) FROM bur_visa_matrix) AS visa_rows,
  (SELECT COUNT(*) FROM bur_gov_watches) AS gov_watches,
  (SELECT COUNT(*) FROM emp_profile) AS profiles;
SQL

echo ""
echo "✅ Migración Fase 2 completa. Recuerda:"
echo "   - Reiniciar engine: docker compose restart engine"
echo "   - Verificar cron count: docker compose logs engine | grep 'jobs registrados'"
echo "   - Importar visa matrix completa con: bash scripts/seed_visa_matrix.sh"
