-- ╔══════════════════════════════════════════════════════════╗
-- ║  ULTRA SYSTEM — Inicialización de Base de Datos          ║
-- ║  Schema completo para todos los pilares                   ║
-- ║  Este script se ejecuta automáticamente la primera vez   ║
-- ╚══════════════════════════════════════════════════════════╝

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  PILAR 4: BUROCRACIA — Alertas de Documentos
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS document_alerts (
    id              SERIAL PRIMARY KEY,
    document_name   VARCHAR(255) NOT NULL,
    document_type   VARCHAR(100) NOT NULL,
    expiry_date     DATE NOT NULL,
    alert_days      INTEGER DEFAULT 60,
    paperless_id    INTEGER,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  CORE: Estado del Usuario
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS user_status (
    id              SERIAL PRIMARY KEY,
    key             VARCHAR(100) UNIQUE NOT NULL,
    value           TEXT NOT NULL,
    category        VARCHAR(50),
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  CORE: Log de Notificaciones
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS notification_log (
    id              SERIAL PRIMARY KEY,
    alert_id        INTEGER REFERENCES document_alerts(id) ON DELETE SET NULL,
    message         TEXT NOT NULL,
    channel         VARCHAR(50) DEFAULT 'telegram',
    sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status          VARCHAR(20) DEFAULT 'sent'
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  CORE: Archivos Subidos (reemplaza Paperless-ngx)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS uploaded_files (
    id              SERIAL PRIMARY KEY,
    original_name   VARCHAR(500) NOT NULL,
    stored_path     TEXT NOT NULL,
    file_size       BIGINT,
    mime_type       VARCHAR(100),
    ocr_text        TEXT,
    ocr_confidence  INTEGER,
    uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  PILAR 1: NOTICIAS — RSS Feeds
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS rss_feeds (
    id              SERIAL PRIMARY KEY,
    url             TEXT UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    category        VARCHAR(100) DEFAULT 'general',
    is_active       BOOLEAN DEFAULT TRUE,
    last_fetched    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rss_articles (
    id              SERIAL PRIMARY KEY,
    feed_id         INTEGER REFERENCES rss_feeds(id) ON DELETE CASCADE,
    title           VARCHAR(500) NOT NULL,
    url             TEXT UNIQUE NOT NULL,
    summary         TEXT,
    published_at    TIMESTAMP,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  PILAR 2: EMPLEO — Fuentes y Ofertas
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS job_sources (
    id              SERIAL PRIMARY KEY,
    url             TEXT UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    css_selector    TEXT NOT NULL,
    region          VARCHAR(50) DEFAULT 'NZ',
    is_active       BOOLEAN DEFAULT TRUE,
    last_hash       TEXT,
    last_checked    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_listings (
    id              SERIAL PRIMARY KEY,
    source_id       INTEGER REFERENCES job_sources(id) ON DELETE CASCADE,
    title           VARCHAR(500) NOT NULL,
    url             TEXT UNIQUE NOT NULL,
    region          VARCHAR(50),
    category        VARCHAR(50) DEFAULT 'other',
    is_seen         BOOLEAN DEFAULT FALSE,
    found_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  CORE: Scheduler Log
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS scheduler_log (
    id              SERIAL PRIMARY KEY,
    job_name        VARCHAR(100) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    duration_ms     INTEGER,
    error_message   TEXT,
    executed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  ÍNDICES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_alerts_expiry ON document_alerts(expiry_date);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON document_alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_status_key ON user_status(key);
CREATE INDEX IF NOT EXISTS idx_status_category ON user_status(category);
CREATE INDEX IF NOT EXISTS idx_articles_feed ON rss_articles(feed_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON rss_articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_url ON rss_articles(url);
CREATE INDEX IF NOT EXISTS idx_listings_source ON job_listings(source_id);
CREATE INDEX IF NOT EXISTS idx_listings_found ON job_listings(found_at);
CREATE INDEX IF NOT EXISTS idx_listings_category ON job_listings(category);

-- Migration: añadir category a job_listings si no existe
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='job_listings' AND column_name='category') THEN
        ALTER TABLE job_listings ADD COLUMN category VARCHAR(50) DEFAULT 'other';
        CREATE INDEX IF NOT EXISTS idx_listings_category ON job_listings(category);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_scheduler_job ON scheduler_log(job_name);
CREATE INDEX IF NOT EXISTS idx_scheduler_time ON scheduler_log(executed_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  PILAR 3: FINANZAS — Ingresos y Gastos
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN CREATE TYPE finance_type AS ENUM ('income', 'expense'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS finances (
    id              SERIAL PRIMARY KEY,
    type            finance_type NOT NULL,
    amount          NUMERIC(12, 2) NOT NULL,
    category        VARCHAR(100) NOT NULL,
    description     TEXT,
    date            DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_finances_date ON finances(date);
CREATE INDEX IF NOT EXISTS idx_finances_type ON finances(type);
CREATE INDEX IF NOT EXISTS idx_finances_category ON finances(category);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  PILAR 5: OPORTUNIDADES — Freelance, ideas, negocios
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN CREATE TYPE opportunity_status AS ENUM ('new', 'contacted', 'applied', 'rejected', 'won'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS opportunities (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,
    source          VARCHAR(255),
    url             TEXT,
    category        VARCHAR(100),
    status          opportunity_status DEFAULT 'new',
    notes           TEXT,
    deadline        DATE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  PILAR 6: LOGISTICA — Transporte, alojamiento, citas
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN CREATE TYPE logistics_type AS ENUM ('transport', 'accommodation', 'visa', 'appointment'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE logistics_status AS ENUM ('pending', 'confirmed', 'done'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS logistics (
    id              SERIAL PRIMARY KEY,
    type            logistics_type NOT NULL,
    title           VARCHAR(500) NOT NULL,
    date            DATE NOT NULL,
    location        VARCHAR(500),
    notes           TEXT,
    status          logistics_status DEFAULT 'pending',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logistics_date ON logistics(date);
CREATE INDEX IF NOT EXISTS idx_logistics_status ON logistics(status);
CREATE INDEX IF NOT EXISTS idx_logistics_type ON logistics(type);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  PILAR 7: BIO-CHECK — Salud y bienestar
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS bio_checks (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL DEFAULT CURRENT_DATE,
    sleep_hours     NUMERIC(3, 1) NOT NULL,
    energy_level    INTEGER NOT NULL CHECK (energy_level BETWEEN 1 AND 10),
    mood            INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 10),
    exercise_minutes INTEGER DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bio_date ON bio_checks(date);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P1: NOTICIAS — Keywords para scoring RSS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS rss_keywords (
    id              SERIAL PRIMARY KEY,
    keyword         VARCHAR(100) NOT NULL UNIQUE,
    weight          INTEGER DEFAULT 5 CHECK (weight BETWEEN 1 AND 10),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Columna de score en articulos RSS (relevancia segun keywords)
DO $$ BEGIN
  ALTER TABLE rss_articles ADD COLUMN relevance_score INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P3: FINANZAS — Budgets por categoria
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS budgets (
    id              SERIAL PRIMARY KEY,
    category        VARCHAR(100) NOT NULL UNIQUE,
    monthly_limit   NUMERIC(12, 2) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P6: LOGISTICA — Columna de costo para presupuesto viaje
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN
  ALTER TABLE logistics ADD COLUMN cost NUMERIC(12, 2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  INDICES ADICIONALES (Smart upgrades)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_rss_keywords_keyword ON rss_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_rss_articles_score ON rss_articles(relevance_score);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
CREATE INDEX IF NOT EXISTS idx_logistics_cost ON logistics(cost);
