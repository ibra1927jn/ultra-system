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
    status          VARCHAR(20) DEFAULT 'new',
    company         VARCHAR(255),
    salary          VARCHAR(100),
    description     TEXT,
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
--  P7: BIO-CHECK — meals como JSONB (v2 prep)
--  Decisión 2026-04-07: estructura [{name, calories, protein, carbs, fat, time}]
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN
  ALTER TABLE bio_checks ADD COLUMN meals JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P4: BUROCRACIA v2 — Multi-stage alerts + tax deadlines + vaccinations
--  Fase 1 Phase 1 Quick Win — 2026-04-07
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- alert_days INT → INTEGER[] (multi-stage 90/60/30/7)
DO $$ BEGIN
  ALTER TABLE document_alerts ADD COLUMN alert_days_array INTEGER[] DEFAULT '{90,60,30,7}';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- Backfill: si no hay array, usar stages estándar (90/60/30/7)
UPDATE document_alerts
SET alert_days_array = ARRAY[90, 60, 30, 7]
WHERE alert_days_array IS NULL OR cardinality(alert_days_array) = 0;

-- País (P6 cross-reference) y owner doc al pasaporte (ES/DZ split)
DO $$ BEGIN
  ALTER TABLE document_alerts ADD COLUMN country VARCHAR(2);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- ─── bur_tax_deadlines: calendario fiscal multi-país ──────
CREATE TABLE IF NOT EXISTS bur_tax_deadlines (
    id              SERIAL PRIMARY KEY,
    country         VARCHAR(2) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    deadline        DATE NOT NULL,
    recurring       BOOLEAN DEFAULT TRUE,
    recurrence_rule VARCHAR(50) DEFAULT 'YEARLY',
    alert_days_array INTEGER[] DEFAULT '{30,14,7,1}',
    is_active       BOOLEAN DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tax_deadlines_country ON bur_tax_deadlines(country);
CREATE INDEX IF NOT EXISTS idx_tax_deadlines_deadline ON bur_tax_deadlines(deadline);
CREATE INDEX IF NOT EXISTS idx_tax_deadlines_active ON bur_tax_deadlines(is_active);

-- Seed: deadlines clave NZ/ES/AU para usuario dual ES/DZ con WHV NZ
INSERT INTO bur_tax_deadlines (country, name, description, deadline, recurring, alert_days_array, notes) VALUES
    ('NZ', 'IR3 — NZ Income Tax Return', 'Declaración anual NZ. Deadline base 7 julio.', '2026-07-07', TRUE, '{60,30,14,7,1}', 'Si tienes contador: extension hasta 31 marzo siguiente'),
    ('NZ', 'PAYE annual reconciliation', 'Reconciliación PAYE empleados NZ', '2026-05-31', TRUE, '{30,14,7,1}', NULL),
    ('ES', 'Modelo 100 — IRPF', 'Declaración Renta IRPF España', '2026-06-30', TRUE, '{60,30,14,7,1}', 'Borrador disponible desde abril'),
    ('ES', 'Modelo 720 — Bienes en el extranjero', 'Declaración informativa bienes >50K€ en extranjero', '2026-03-31', TRUE, '{60,30,14,7,1}', 'Crítico: penalización fuerte si se omite'),
    ('ES', 'Modelo 721 — Criptomonedas extranjero', 'Declaración crypto en exchanges extranjeros >50K€', '2026-03-31', TRUE, '{60,30,14,7,1}', 'NEW: aplicable si crypto en Binance/etc supera €50K en algún momento del año'),
    ('ES', 'Modelo 210 — IRNR no residentes', 'Trimestral. Q1 abril, Q2 julio, Q3 octubre, Q4 enero', '2026-07-20', TRUE, '{30,14,7,1}', 'Si eres no residente fiscal con bienes en ES'),
    ('AU', 'AU Income Tax Return', 'Declaración anual AU (1 julio – 31 octubre)', '2026-10-31', TRUE, '{60,30,14,7,1}', 'Self-lodge deadline. Con tax agent: extension a mayo siguiente'),
    ('AU', 'PAYG quarterly BAS Q4', 'Quarterly Business Activity Statement', '2026-07-28', TRUE, '{30,14,7,1}', 'Solo si tienes ABN/business'),
    ('NZ', 'KiwiSaver annual statement', 'Estado anual KiwiSaver — revisar contribuciones', '2026-09-30', TRUE, '{30,14}', NULL),
    ('EU', 'DAC8 reporting (crypto exchanges)', 'DAC8 entra en vigor — exchanges UE reportan a Hacienda', '2026-01-01', FALSE, '{60,30,14,7}', 'No es deadline propio, pero conviene revisar exposición crypto antes')
ON CONFLICT DO NOTHING;

-- ─── bur_vaccinations: certificados de vacunación ─────────
-- (Decisión 2026-04-07: P4 owner, P7 consume vía evento bur.vaccination_updated)
CREATE TABLE IF NOT EXISTS bur_vaccinations (
    id              SERIAL PRIMARY KEY,
    vaccine         VARCHAR(200) NOT NULL,
    dose_number     INTEGER,
    date_given      DATE NOT NULL,
    location        VARCHAR(200),
    country         VARCHAR(2),
    batch_number    VARCHAR(100),
    expiry_date     DATE,
    certificate_url TEXT,
    paperless_id    INTEGER,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vaccinations_vaccine ON bur_vaccinations(vaccine);
CREATE INDEX IF NOT EXISTS idx_vaccinations_expiry ON bur_vaccinations(expiry_date);
CREATE INDEX IF NOT EXISTS idx_vaccinations_country ON bur_vaccinations(country);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P1: NOTICIAS Phase 1 — 23 países faltantes + GDELT + Bluesky
--  Fase 1 Quick Win — 2026-04-07
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 23 países priorizados por perfil del usuario (dual ES/DZ van-life nómada)
-- Incluye Algeria (CRÍTICO — nacionalidad del usuario, ausente del seed v1)
INSERT INTO rss_feeds (url, name, category) VALUES
    -- MENA / Maghreb (nacionalidad usuario + ruta DN)
    ('https://www.aps.dz/en/feed', 'Algerie Press Service (DZ)', 'country-dz'),
    ('https://www.moroccoworldnews.com/feed', 'Morocco World News (MA)', 'country-ma'),
    ('https://allafrica.com/tools/headlines/rdf/tunisia/headlines.rdf', 'AllAfrica Tunisia (TN)', 'country-tn'),
    ('https://egyptindependent.com/feed/', 'Egypt Independent (EG)', 'country-eg'),
    ('https://www.timesofisrael.com/feed/', 'Times of Israel (IL)', 'country-il'),
    ('https://www.khaleejtimes.com/rss', 'Khaleej Times (AE)', 'country-ae'),
    ('https://www.arabnews.com/cat/1/rss.xml', 'Arab News (SA)', 'country-sa'),
    ('https://www.hurriyetdailynews.com/rss', 'Hurriyet Daily News (TR)', 'country-tr'),
    -- Europa (gaps)
    ('https://www.theportugalnews.com/rss', 'The Portugal News (PT)', 'country-pt'),
    ('https://www.ansa.it/english/news/news_english_rss.xml', 'ANSA English (IT)', 'country-it'),
    ('https://www.france24.com/en/rss', 'France 24 English (FR)', 'country-fr'),
    ('https://www.dutchnews.nl/feed/', 'DutchNews.nl (NL)', 'country-nl'),
    ('https://www.thelocal.se/feeds/rss.php', 'The Local Sweden (SE)', 'country-se'),
    ('https://www.swissinfo.ch/eng/latest-news/rss', 'Swissinfo (CH)', 'country-ch'),
    ('https://www.ekathimerini.com/feed/', 'Ekathimerini (GR)', 'country-gr'),
    ('https://www.rte.ie/news/rss/news-headlines.xml', 'RTÉ News (IE)', 'country-ie'),
    -- LatAm (gaps relevantes para nomadeo)
    ('https://mexiconewsdaily.com/feed/', 'Mexico News Daily (MX)', 'country-mx'),
    ('https://www.biobiochile.cl/rss/portada.rss', 'BioBioChile (CL)', 'country-cl'),
    ('https://www.eltiempo.com/rss/internacional.xml', 'El Tiempo Internacional (CO)', 'country-co'),
    -- Asia (DN destinations)
    ('https://e.vnexpress.net/rss/news.rss', 'VnExpress International (VN)', 'country-vn'),
    ('https://www.bangkokpost.com/rss/data/topstories.xml', 'Bangkok Post (TH)', 'country-th'),
    ('https://www.koreaherald.com/feed', 'Korea Herald (KR)', 'country-kr'),
    ('https://www.philstar.com/rss/headlines', 'Philippine Star (PH)', 'country-ph')
ON CONFLICT (url) DO NOTHING;

-- Reemplazos para URLs rotas detectadas en first-fetch (2026-04-07)
-- Idempotente: WHERE url='OLD_URL' → primer run actualiza, runs posteriores no-op
-- (porque después del primer run, el OLD_URL ya no existe, y el INSERT con OLD_URL
-- de arriba será no-op por ON CONFLICT (url) DO NOTHING contra el NEW_URL).
-- Para evitar que el INSERT de arriba reinserte el OLD_URL en runs posteriores,
-- también borramos cualquier fila con OLD_URL antes del UPDATE.
DELETE FROM rss_feeds WHERE url IN (
  'https://www.ansa.it/english/news/news_english_rss.xml',
  'https://www.aps.dz/en/feed',
  'https://www.biobiochile.cl/rss/portada.rss',
  'https://www.eltiempo.com/rss/internacional.xml',
  'https://www.khaleejtimes.com/rss',
  'https://www.koreaherald.com/feed',
  'https://www.swissinfo.ch/eng/latest-news/rss',
  'https://www.arabnews.com/cat/1/rss.xml',
  'https://www.bangkokpost.com/rss/data/topstories.xml',
  'https://www.ekathimerini.com/feed/',
  'https://www.timesofisrael.com/feed/',
  'https://www.philstar.com/rss/headlines',
  'https://www.rte.ie/news/rss/news-headlines.xml'
) AND id NOT IN (SELECT MIN(id) FROM rss_feeds GROUP BY category HAVING category LIKE 'country-%');

-- Ahora INSERT idempotente de las URLs corregidas (si todavía no existen)
INSERT INTO rss_feeds (url, name, category) VALUES
    ('https://www.ansa.it/sito/ansait_rss.xml', 'ANSA English (IT)', 'country-it'),
    ('https://www.tsa-algerie.com/feed/', 'TSA Algérie (DZ)', 'country-dz'),
    ('https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml', 'La Tercera (CL)', 'country-cl'),
    ('https://www.eltiempo.com/rss/mundo.xml', 'El Tiempo Internacional (CO)', 'country-co'),
    ('https://feeds.feedburner.com/khaleejtimes/uae', 'Khaleej Times (AE)', 'country-ae'),
    ('https://english.hani.co.kr/rss/', 'Hankyoreh (KR)', 'country-kr'),
    ('https://www.letemps.ch/articles.rss', 'Le Temps (CH)', 'country-ch'),
    ('https://english.aawsat.com/feed', 'Asharq Al-Awsat (SA)', 'country-sa'),
    ('https://thethaiger.com/feed', 'The Thaiger (TH)', 'country-th'),
    ('https://www.greekreporter.com/feed/', 'Greek Reporter (GR)', 'country-gr'),
    ('https://www.jpost.com/rss/rssfeedsfrontpage.aspx', 'Jerusalem Post (IL)', 'country-il'),
    ('https://www.inquirer.net/fullfeed', 'Inquirer.net (PH)', 'country-ph'),
    ('https://www.thejournal.ie/feed/', 'The Journal (IE)', 'country-ie')
ON CONFLICT (url) DO NOTHING;

-- Limpia cualquier duplicado category= que haya quedado del run buggy anterior:
-- mantiene solo la fila más reciente (mayor id) por category
DELETE FROM rss_feeds a USING rss_feeds b
WHERE a.category LIKE 'country-%' AND a.category = b.category AND a.id < b.id;

-- Pseudo-feeds para fuentes no-RSS (GDELT API + Bluesky search).
-- Sirven como source_id para news_apis.js (lookup por category vía
-- pseudoFeedId()). El URL es 'pseudo://...' por convención para que
-- rss.js getFeeds() los excluya con `url NOT LIKE 'pseudo:%'`. Las URLs
-- HTTPS reales viven hardcodeadas en news_apis.js y wm_gdelt_intel.js.
INSERT INTO rss_feeds (url, name, category) VALUES
    ('pseudo://gdelt', 'GDELT DOC 2.0 (global)', 'gdelt'),
    ('pseudo://bsky',  'Bluesky Search',         'bsky')
ON CONFLICT (url) DO NOTHING;
-- Idempotent migration: si existían las URLs HTTPS legacy, las normalizamos.
UPDATE rss_feeds SET url = 'pseudo://gdelt' WHERE url = 'https://api.gdeltproject.org/api/v2/doc/doc';
UPDATE rss_feeds SET url = 'pseudo://bsky'  WHERE url = 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts';

-- Keywords prioritarios para alimentar GDELT y Bluesky search (si la tabla está vacía)
INSERT INTO rss_keywords (keyword, weight) VALUES
    ('algeria', 9), ('morocco', 7), ('whv', 8), ('working holiday visa', 9),
    ('immigration nz', 9), ('immigration australia', 8),
    ('modelo 720', 8), ('modelo 721', 8), ('beckham law', 7),
    ('crypto regulation', 7), ('mica', 6), ('dac8', 7),
    ('schengen', 6), ('passport', 5), ('visa policy', 7)
ON CONFLICT (keyword) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Dead URL curation 2026-04-07 — second pass tras probe completo
--  desde Hetzner CX43. Fixes URL paths que cambiaron y soft-disable
--  de fuentes inalcanzables (CF block, RSS removed, dead handles).
--  Idempotente: WHERE clauses con la URL antigua, no-op tras run.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Path/host updates (fuente sigue viva, solo cambió la URL)
UPDATE rss_feeds SET url='https://editorial.aristeguinoticias.com/feed/'
 WHERE url='https://aristeguinoticias.com/feed/';
UPDATE rss_feeds SET url='https://www.tvn-2.com/rss', name='TVN-2 (PA)'
 WHERE url='https://www.laprensa.com.pa/feeds/rss/';
UPDATE rss_feeds SET url='https://elcomercio.pe/arc/outboundfeeds/rss/?outputType=xml'
 WHERE url='https://elcomercio.pe/feed/';
UPDATE rss_feeds SET url='https://rss.dw.com/xml/rss-sp-all'
 WHERE url='https://www.dw.com/atom/rss-es-es';
UPDATE rss_feeds SET url='https://www.euronews.com/rss'
 WHERE url='https://www.euronews.com/rss?format=xml';
UPDATE rss_feeds SET url='https://www.dn.se/rss'
 WHERE url='https://www.dn.se/rss/senaste-nytt/';
UPDATE rss_feeds SET url='https://news.un.org/feed/subscribe/en/news/all/rss.xml/'
 WHERE url='https://news.un.org/feed/subscribe/en/news/all/rss.xml';
UPDATE rss_feeds SET url='https://oglobo.globo.com/rss'
 WHERE url='https://oglobo.globo.com/rss/top_noticias/';
UPDATE rss_feeds SET url='https://feeds.feedburner.com/EuropaPress', name='Europa Press (ES)'
 WHERE url='https://www.efe.com/efe/espana/1/rss';
UPDATE rss_feeds SET url='https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=rss'
 WHERE url='https://en.wikinews.org/w/index.php?title=Special:NewsFeed&format=rss';

-- Soft-disable: Cloudflare/IP-blocked desde datacenter (sin proxy residencial no hay fix)
UPDATE rss_feeds SET is_active=FALSE WHERE url IN (
  'https://www.moroccoworldnews.com/feed',
  'https://tvn24.pl/najwazniejsze.xml',
  'https://www.bangkokpost.com/rss',
  'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  'https://www.cnbc.com/id/19854910/device/rss/rss.html',
  'https://www.cisa.gov/cybersecurity-advisories/all.xml',
  'https://www.aei.org/feed/',
  'https://responsiblestatecraft.org/feed/',
  'https://www.jeuneafrique.com/feed/',
  'https://rsshub.app/nhk/news/en',
  'https://rsshub.app/gov/miit/zcjd',
  'https://rsshub.app/gov/mofcom/article/xwfb',
  'https://www.csis.org/analysis?type=analysis',
  'https://www.rand.org/rss/all.xml',
  'https://www.nti.org/rss/',
  'https://www.stimson.org/feed/',
  'https://www.service.nsw.gov.au/news.xml',
  'https://www.vicroads.vic.gov.au/about-vicroads/news-and-media/news.rss',
  'https://www.tmr.qld.gov.au/About-us/News-and-events.aspx?rss=1',
  'https://www.transport.wa.gov.au/imagesource/Newscentre/news.rss',
  'https://www.sa.gov.au/news/feed',
  'https://www.liberation.fr/arc/outboundfeeds/collection/accueil-une/?outputType=xml'
);

-- Soft-disable: RSS removed by publisher (no replacement)
UPDATE rss_feeds SET is_active=FALSE WHERE url IN (
  'https://www.proceso.com.mx/rss',
  'https://xml2.corriereobjects.it/rss/incipit.xml',
  'https://www.eluniversal.com.mx/rss.xml',
  'https://www.brookings.edu/feed/',
  'https://carnegieendowment.org/rss/',
  'https://www.rigzone.com/news/rss.asp',
  'https://www.lusa.pt/rss',
  'https://www.elwatan-dz.com/feed'
);

-- Soft-disable: dead Mastodon handles (404/410)
UPDATE rss_feeds SET is_active=FALSE WHERE url IN (
  'https://mastodon.world/@bellingcat.rss',
  'https://newsie.social/@reuters.rss',
  'https://mstdn.social/@BBCBreakingNews.rss'
);

-- Soft-disable: duplicates de URLs canónicas existentes
UPDATE rss_feeds SET is_active=FALSE WHERE url IN (
  'https://www.dw.com/es/temas/s-30684?maca=spa-rss-spa-all-1491-rdf',  -- dup DW
  'https://vnexpress.net/rss',                                          -- dup VnExpress
  'https://www.latercera.com/feed/',                                    -- dup La Tercera
  'https://www.khaleejtimes.com/rss'                                    -- dup Khaleej
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P3: FINANZAS Phase 1 — multi-currency + CSV import + FX
--  Fase 1 Quick Win — 2026-04-07
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Extensiones a la tabla finances existente (idempotente)
DO $$ BEGIN
  ALTER TABLE finances ADD COLUMN currency VARCHAR(3) DEFAULT 'NZD';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE finances ADD COLUMN amount_nzd NUMERIC(14, 2);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE finances ADD COLUMN account VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE finances ADD COLUMN source VARCHAR(20) DEFAULT 'manual';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE finances ADD COLUMN imported_id VARCHAR(200);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE finances ADD COLUMN fingerprint VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- Backfill amount_nzd para filas existentes (asume currency=NZD)
UPDATE finances SET amount_nzd = amount WHERE amount_nzd IS NULL;

-- Dedup constraints (parciales)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_finances_imported_id
  ON finances (account, imported_id) WHERE imported_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_finances_fingerprint
  ON finances (fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finances_account ON finances(account);
CREATE INDEX IF NOT EXISTS idx_finances_currency ON finances(currency);

-- ─── fin_exchange_rates: cache diario de FX (Frankfurter free) ─
CREATE TABLE IF NOT EXISTS fin_exchange_rates (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    base            VARCHAR(3) NOT NULL,
    quote           VARCHAR(3) NOT NULL,
    rate            NUMERIC(18, 8) NOT NULL,
    source          VARCHAR(30) DEFAULT 'frankfurter',
    fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (date, base, quote)
);

CREATE INDEX IF NOT EXISTS idx_fx_date_base ON fin_exchange_rates(date DESC, base);
CREATE INDEX IF NOT EXISTS idx_fx_quote ON fin_exchange_rates(quote);

-- ─── fin_net_worth_snapshots: snapshot diario para tracking ──
CREATE TABLE IF NOT EXISTS fin_net_worth_snapshots (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL UNIQUE,
    total_nzd       NUMERIC(14, 2) NOT NULL,
    breakdown       JSONB,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nw_date ON fin_net_worth_snapshots(date DESC);

-- ─── fin_recurring: detección de gastos recurrentes ─────────
CREATE TABLE IF NOT EXISTS fin_recurring (
    id              SERIAL PRIMARY KEY,
    payee_normalized VARCHAR(200) NOT NULL,
    frequency       VARCHAR(20) NOT NULL,
    amount_avg      NUMERIC(14, 2),
    currency        VARCHAR(3) DEFAULT 'NZD',
    next_expected   DATE,
    confirmed       BOOLEAN DEFAULT FALSE,
    last_seen       DATE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (payee_normalized, frequency)
);

CREATE INDEX IF NOT EXISTS idx_recurring_next ON fin_recurring(next_expected);

-- Seed: budgets pre-loaded NZ van-life (envelope budgeting baseline)
INSERT INTO budgets (category, monthly_limit) VALUES
    ('groceries', 400),
    ('fuel', 300),
    ('campsites', 200),
    ('eating_out', 150),
    ('phone_internet', 60),
    ('insurance_van', 80),
    ('insurance_health', 80),
    ('vehicle_maintenance', 100),
    ('subscriptions', 50)
ON CONFLICT (category) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P6: LOGÍSTICA Phase 1 — POI/weather/memberships + NZ warrant
--  Fase 1 Quick Win — 2026-04-07
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Coordenadas en logistics (sin PostGIS — NUMERIC + Haversine en JS)
DO $$ BEGIN
  ALTER TABLE logistics ADD COLUMN latitude NUMERIC(10, 6);
EXCEPTION WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE logistics ADD COLUMN longitude NUMERIC(10, 6);
EXCEPTION WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE logistics ADD COLUMN country VARCHAR(2);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- log_pois: POIs cacheados externos (Overpass + DOC NZ + iOverlander)
-- Separado de log_locations existente (que es para current location/waypoints del usuario)
CREATE TABLE IF NOT EXISTS log_pois (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(500) NOT NULL,
    latitude        NUMERIC(10, 6) NOT NULL,
    longitude       NUMERIC(10, 6) NOT NULL,
    poi_type        VARCHAR(50) NOT NULL,
    country         VARCHAR(2),
    region          VARCHAR(100),
    source          VARCHAR(50) NOT NULL,
    source_id       VARCHAR(200),
    cost            NUMERIC(10, 2),
    currency        VARCHAR(3),
    is_free         BOOLEAN,
    has_water       BOOLEAN,
    has_dump        BOOLEAN,
    has_shower      BOOLEAN,
    has_wifi        BOOLEAN,
    has_power       BOOLEAN,
    is_self_contained_only BOOLEAN,
    rating          NUMERIC(3, 1),
    tags            JSONB,
    notes           TEXT,
    visited         BOOLEAN DEFAULT FALSE,
    visited_at      TIMESTAMP,
    fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_log_pois_type ON log_pois(poi_type);
CREATE INDEX IF NOT EXISTS idx_log_pois_country ON log_pois(country);
CREATE INDEX IF NOT EXISTS idx_log_pois_lat_lon ON log_pois(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_log_pois_source ON log_pois(source);

-- log_memberships: subscriptions de housesit/work-exchange con renewal tracking
CREATE TABLE IF NOT EXISTS log_memberships (
    id              SERIAL PRIMARY KEY,
    platform        VARCHAR(100) NOT NULL UNIQUE,
    annual_cost     NUMERIC(10, 2),
    currency        VARCHAR(3) DEFAULT 'NZD',
    renews_at       DATE,
    last_paid_at    DATE,
    auto_renew      BOOLEAN DEFAULT FALSE,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memberships_renews ON log_memberships(renews_at);

-- log_weather_cache: forecast diario para coordenada actual (Open-Meteo)
CREATE TABLE IF NOT EXISTS log_weather_cache (
    id              SERIAL PRIMARY KEY,
    latitude        NUMERIC(10, 6) NOT NULL,
    longitude       NUMERIC(10, 6) NOT NULL,
    date            DATE NOT NULL,
    temp_max        NUMERIC(5, 2),
    temp_min        NUMERIC(5, 2),
    precip_mm       NUMERIC(6, 2),
    wind_kph        NUMERIC(5, 2),
    weather_code    INTEGER,
    summary         VARCHAR(200),
    fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (latitude, longitude, date)
);

CREATE INDEX IF NOT EXISTS idx_weather_loc_date ON log_weather_cache(latitude, longitude, date DESC);

-- ─── Seed: 4 housesit/work-exchange memberships baseline (~$170/yr) ──
INSERT INTO log_memberships (platform, annual_cost, currency, renews_at, notes) VALUES
    ('Workaway', 49, 'USD', '2027-01-15', 'Single account. Baseline volunteer/work-exchange platform.'),
    ('MindMyHouse', 29, 'USD', '2027-03-01', 'Housesit alternativa low-cost a TrustedHousesitters.'),
    ('WWOOF-NZ', 40, 'NZD', '2027-04-15', 'Crítico para NZ farms organic — exchange comida/alojamiento por trabajo.'),
    ('HelpX', 20, 'EUR', '2027-02-10', 'Premium 2-yr membership. UE based, fuerte en EU + NZ + AU.')
ON CONFLICT (platform) DO NOTHING;

-- ─── NZ green warrant: USA EL SISTEMA P4 multi-stage existente ──
-- Hard deadline 7 junio 2026 — Self-Contained Motor Vehicles Act
-- Multi-stage activo: avisará a los 90/60/30/7 días automáticamente
INSERT INTO document_alerts (document_name, document_type, expiry_date, alert_days_array, country, notes)
SELECT 'NZ Green Warrant Self-Contained', 'vehicle_certification', '2026-06-07'::date,
       ARRAY[60, 30, 14, 7, 3, 1], 'NZ',
       'CRÍTICO: Self-Contained Motor Vehicles Act deadline final. Solo green warrant válido. Toilet fijo obligatorio desde dic 2023.'
WHERE NOT EXISTS (
  SELECT 1 FROM document_alerts WHERE document_name = 'NZ Green Warrant Self-Contained'
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P7: BIO-CHECK Phase 1 — extensión bio_checks v2 + outbreak alerts
--  Fase 1 Quick Win — 2026-04-07
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Extensiones idempotentes a bio_checks (v2 fields del master doc)
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN weight_kg NUMERIC(5, 2); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN body_fat_pct NUMERIC(4, 1); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN hrv NUMERIC(5, 1); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN heart_rate_avg INTEGER; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN water_ml INTEGER; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 10); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN steps INTEGER; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN habits JSONB DEFAULT '{}'::jsonb; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE bio_checks ADD COLUMN source VARCHAR(30) DEFAULT 'manual'; EXCEPTION WHEN duplicate_column THEN null; END $$;

-- ─── health_alerts: outbreak/disease scrapers (WHO/CDC/ECDC/MAEC) ──
CREATE TABLE IF NOT EXISTS health_alerts (
    id              SERIAL PRIMARY KEY,
    source          VARCHAR(30) NOT NULL,
    country_iso     VARCHAR(2),
    alert_level     VARCHAR(20) DEFAULT 'info',
    disease         VARCHAR(200),
    title           TEXT NOT NULL,
    description     TEXT,
    url             TEXT UNIQUE,
    published_at    TIMESTAMP,
    fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_alerts_country ON health_alerts(country_iso);
CREATE INDEX IF NOT EXISTS idx_health_alerts_published ON health_alerts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_alerts_source ON health_alerts(source);

-- ─── health_documents: vault de records médicos (metadatos) ──
CREATE TABLE IF NOT EXISTS health_documents (
    id              SERIAL PRIMARY KEY,
    doc_type        VARCHAR(50) NOT NULL,
    date            DATE NOT NULL,
    country         VARCHAR(2),
    provider        VARCHAR(200),
    title           VARCHAR(500) NOT NULL,
    file_path       TEXT,
    paperless_id    INTEGER,
    metadata        JSONB,
    tags            TEXT[],
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_docs_date ON health_documents(date DESC);
CREATE INDEX IF NOT EXISTS idx_health_docs_type ON health_documents(doc_type);

-- ─── external_health_services: registry de los 4 containers self-hosted ──
CREATE TABLE IF NOT EXISTS external_health_services (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,
    container       VARCHAR(50) NOT NULL,
    internal_url    TEXT NOT NULL,
    external_port   INTEGER NOT NULL,
    purpose         TEXT,
    last_probe      TIMESTAMP,
    last_status     INTEGER,
    is_active       BOOLEAN DEFAULT TRUE
);

INSERT INTO external_health_services (name, container, internal_url, external_port, purpose) VALUES
    ('wger', 'ultra_wger', 'http://wger:8000', 8001, 'Fitness tracker (Django) — 896 ejercicios, workouts, plan nutrición'),
    ('mealie', 'ultra_mealie', 'http://mealie:9000', 8002, 'Recetas + meal planning (FastAPI+Vue)'),
    ('grocy', 'ultra_grocy', 'http://grocy:80', 8003, 'Despensa van + expiry tracking + shopping list (PHP)'),
    ('fasten', 'ultra_fasten', 'https://fasten:8080', 8004, 'Personal Health Record vault (Go) — HTTPS auto-generated certs')
ON CONFLICT (name) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P5: OPORTUNIDADES Phase 1 — multi-source remote fetchers
--  Fase 1 Quick Win — 2026-04-07
--  Decisión 2026-04-07: P5 = remoto, P2 = presencial
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN description TEXT; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN source_type VARCHAR(20); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN payout_type VARCHAR(20); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN salary_min NUMERIC(12, 2); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN salary_max NUMERIC(12, 2); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN currency VARCHAR(3); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN language_req TEXT[]; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN tags TEXT[]; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN match_score INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN external_id VARCHAR(200); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN posted_at TIMESTAMP; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE opportunities ADD COLUMN last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities(source);
CREATE INDEX IF NOT EXISTS idx_opportunities_posted ON opportunities(posted_at DESC);

-- Dedup por url unique parcial (algunas oportunidades pueden tener mismo url tras edits)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_opportunities_url ON opportunities(url) WHERE url IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P2: EMPLEO Phase 1 — ATS APIs + tracked companies + scoring
--  Fase 1 Quick Win — 2026-04-07
--  Decisión 2026-04-07: P2 = presencial, P5 = remoto
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Extensiones idempotentes a job_listings (v2 fields)
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN external_id VARCHAR(200); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN company_url TEXT; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN location_country VARCHAR(2); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN location_city VARCHAR(100); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN location_raw VARCHAR(255); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN sector VARCHAR(50); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN job_type VARCHAR(30); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN is_remote BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN salary_min NUMERIC(12, 2); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN salary_max NUMERIC(12, 2); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN salary_currency VARCHAR(3); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN visa_sponsorship BOOLEAN; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN posted_at TIMESTAMP; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN match_score INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN speed_score INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN difficulty_score INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN total_score INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN fingerprint VARCHAR(64); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE job_listings ADD COLUMN source_type VARCHAR(20) DEFAULT 'scrape'; EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_total_score ON job_listings(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_country ON job_listings(location_country);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON job_listings(company);
CREATE INDEX IF NOT EXISTS idx_jobs_posted ON job_listings(posted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_fingerprint ON job_listings(fingerprint) WHERE fingerprint IS NOT NULL;

-- ─── emp_tracked_companies: empresas a pollear via ATS APIs ──
CREATE TABLE IF NOT EXISTS emp_tracked_companies (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    ats_type        VARCHAR(20) NOT NULL,
    ats_token       VARCHAR(200) NOT NULL,
    country         VARCHAR(2),
    sector          VARCHAR(50),
    visa_sponsor    BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    last_fetched    TIMESTAMP,
    last_count      INTEGER,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ats_type, ats_token)
);

CREATE INDEX IF NOT EXISTS idx_emp_companies_active ON emp_tracked_companies(is_active);
CREATE INDEX IF NOT EXISTS idx_emp_companies_country ON emp_tracked_companies(country);

-- ─── Seed: empresas tech relevantes para usuario (NZ + AU + ES + visa sponsors) ──
-- Greenhouse: ~7,500 empresas. Lever: ~5,000. Ashby: ~1,500 (incl Anthropic, OpenAI, Vercel).
INSERT INTO emp_tracked_companies (name, ats_type, ats_token, country, sector, visa_sponsor, notes) VALUES
    -- Ashby (top tier, includes AI labs)
    ('Anthropic', 'ashby', 'anthropic', 'US', 'ai', TRUE, 'Claude maker — visa sponsor'),
    ('OpenAI', 'ashby', 'openai', 'US', 'ai', TRUE, 'GPT — visa sponsor'),
    ('Vercel', 'ashby', 'vercel', 'US', 'devtools', TRUE, 'Next.js company — remote-friendly'),
    ('Linear', 'ashby', 'linear', 'US', 'devtools', TRUE, 'Project management remote'),
    ('Ramp', 'ashby', 'ramp', 'US', 'fintech', TRUE, 'Fintech remote'),
    -- Greenhouse (massive coverage)
    ('Stripe', 'greenhouse', 'stripe', 'US', 'fintech', TRUE, 'Payments — visa sponsor'),
    ('Airbnb', 'greenhouse', 'airbnb', 'US', 'travel', TRUE, 'Travel — remote-friendly'),
    ('Rocket Lab', 'greenhouse', 'rocketlab', 'NZ', 'aerospace', TRUE, 'NZ company! Auckland-based'),
    ('Weta FX', 'greenhouse', 'wetafx', 'NZ', 'vfx', TRUE, 'NZ Wellington VFX powerhouse'),
    ('Xero', 'greenhouse', 'xero', 'NZ', 'accounting', TRUE, 'NZ accounting SaaS'),
    ('Fisher and Paykel Healthcare', 'greenhouse', 'fphcare', 'NZ', 'medical', TRUE, 'NZ medical devices'),
    ('Atlassian', 'greenhouse', 'atlassian', 'AU', 'devtools', TRUE, 'AU Sydney-based, multi-country'),
    ('Canva', 'greenhouse', 'canva', 'AU', 'design', TRUE, 'AU Sydney design tool'),
    -- Lever
    ('Netflix', 'lever', 'netflix', 'US', 'media', TRUE, 'Media streaming'),
    ('Twilio', 'lever', 'twilio', 'US', 'devtools', TRUE, 'Comms API'),
    ('Eventbrite', 'lever', 'eventbrite', 'US', 'events', TRUE, NULL),
    ('Cresta', 'lever', 'cresta', 'US', 'ai', TRUE, NULL),
    -- SmartRecruiters
    ('IKEA', 'smartrecruiters', 'IKEA1', NULL, 'retail', TRUE, 'Multi-country retail'),
    ('Visa', 'smartrecruiters', 'Visa', 'US', 'fintech', TRUE, NULL),
    ('Bosch', 'smartrecruiters', 'BoschGroup', 'DE', 'industrial', TRUE, 'German engineering — visa sponsor')
ON CONFLICT (ats_type, ats_token) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  INDICES ADICIONALES (Smart upgrades)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_rss_keywords_keyword ON rss_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_rss_articles_score ON rss_articles(relevance_score);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
CREATE INDEX IF NOT EXISTS idx_logistics_cost ON logistics(cost);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P4 FASE 2 — Schengen 90/180 calculator + passport-index
--  matrix multi-país. Crítico para usuario dual ES/DZ nómada.
--  Aplicado 2026-04-07
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── bur_travel_log: historial de entradas/salidas por país ─
-- Source 'manual' por defecto; futuras importaciones de stamps OCR.
CREATE TABLE IF NOT EXISTS bur_travel_log (
    id              SERIAL PRIMARY KEY,
    country         VARCHAR(2) NOT NULL,
    area            VARCHAR(20),     -- 'SCHENGEN' | 'CTA' (UK+IE) | NULL
    entry_date      DATE NOT NULL,
    exit_date       DATE,            -- NULL = ongoing stay
    purpose         VARCHAR(50),     -- 'tourism'|'work'|'transit'|'whv'|'residency'
    passport_used   VARCHAR(2),      -- 'ES'|'DZ' (cuál pasaporte sellaste)
    notes           TEXT,
    source          VARCHAR(20) DEFAULT 'manual',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (exit_date IS NULL OR exit_date >= entry_date)
);

CREATE INDEX IF NOT EXISTS idx_travel_country ON bur_travel_log(country);
CREATE INDEX IF NOT EXISTS idx_travel_area ON bur_travel_log(area);
CREATE INDEX IF NOT EXISTS idx_travel_entry ON bur_travel_log(entry_date);
CREATE INDEX IF NOT EXISTS idx_travel_exit ON bur_travel_log(exit_date);

-- ─── bur_visa_matrix: passport × destination requirements ───
-- Datos derivados de ilyankou/passport-index-dataset (CC BY-SA 4.0).
-- Subset curado para ES + DZ + destinos clave del usuario nómada.
CREATE TABLE IF NOT EXISTS bur_visa_matrix (
    id              SERIAL PRIMARY KEY,
    passport        VARCHAR(2) NOT NULL,
    destination     VARCHAR(2) NOT NULL,
    requirement     VARCHAR(30) NOT NULL,   -- 'visa free'|'visa on arrival'|'eta'|'e-visa'|'visa required'|'no admission'
    days_allowed    INTEGER,                 -- NULL = unlimited or n/a
    notes           TEXT,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (passport, destination)
);

CREATE INDEX IF NOT EXISTS idx_visa_passport ON bur_visa_matrix(passport);
CREATE INDEX IF NOT EXISTS idx_visa_destination ON bur_visa_matrix(destination);

-- ─── Seed: Schengen Area países (26 estados a 2026-04) ──────
-- Croacia añadida 2023-01-01. Bulgaria + Rumanía: aire/mar 2024-03-31, tierra 2025-01-01.
-- Irlanda y Chipre NO Schengen. CH/IS/NO/LI sí (4 EFTA).
INSERT INTO bur_visa_matrix (passport, destination, requirement, days_allowed, notes) VALUES
    -- ════════ ES PASSPORT (EU citizen — uno de los más fuertes del mundo) ════════
    ('ES', 'AT', 'freedom of movement', NULL, 'EU/EEA/Schengen — residencia ilimitada'),
    ('ES', 'BE', 'freedom of movement', NULL, 'EU/EEA/Schengen'),
    ('ES', 'BG', 'freedom of movement', NULL, 'EU'),
    ('ES', 'HR', 'freedom of movement', NULL, 'EU — Schengen 2023-01-01'),
    ('ES', 'CY', 'freedom of movement', NULL, 'EU (no Schengen)'),
    ('ES', 'CZ', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'DK', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'EE', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'FI', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'FR', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'DE', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'GR', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'HU', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'IE', 'freedom of movement', NULL, 'EU (CTA, no Schengen)'),
    ('ES', 'IT', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'LV', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'LT', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'LU', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'MT', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'NL', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'PL', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'PT', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'RO', 'freedom of movement', NULL, 'EU'),
    ('ES', 'SK', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'SI', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'SE', 'freedom of movement', NULL, 'EU/Schengen'),
    ('ES', 'CH', 'visa free', 90, 'EFTA Schengen — 90/180. ES residence permit allows longer'),
    ('ES', 'IS', 'visa free', 90, 'EFTA Schengen — 90/180'),
    ('ES', 'NO', 'visa free', 90, 'EFTA Schengen — 90/180'),
    ('ES', 'LI', 'visa free', 90, 'EFTA Schengen — 90/180'),
    -- Anglosphere
    ('ES', 'GB', 'visa free', 180, 'UK 6 months tourism since Brexit'),
    ('ES', 'IM', 'visa free', 180, 'Isle of Man (UK CTA)'),
    ('ES', 'US', 'eta', 90, 'ESTA $21 — Visa Waiver Program. Renew every 2y'),
    ('ES', 'CA', 'eta', 180, 'eTA CAD$7 — válida 5 años'),
    ('ES', 'NZ', 'eta', 90, 'NZeTA NZD$23 + IVL $100 — válida 2 años. Visa-free 90 días'),
    ('ES', 'AU', 'e-visa', 90, 'eVisitor (subclass 651) FREE — válido 12 meses'),
    -- LATAM (sin visa para ES)
    ('ES', 'MX', 'visa free', 180, 'FMM tourist card on arrival'),
    ('ES', 'AR', 'visa free', 90, NULL),
    ('ES', 'BR', 'visa free', 90, 'eVisa reintroduced for some — verificar'),
    ('ES', 'CL', 'visa free', 90, NULL),
    ('ES', 'CO', 'visa free', 90, NULL),
    ('ES', 'PE', 'visa free', 183, NULL),
    ('ES', 'UY', 'visa free', 90, NULL),
    ('ES', 'EC', 'visa free', 90, NULL),
    ('ES', 'CR', 'visa free', 90, NULL),
    -- Asia
    ('ES', 'JP', 'visa free', 90, NULL),
    ('ES', 'KR', 'visa free', 90, 'K-ETA required'),
    ('ES', 'TH', 'visa free', 60, 'Updated 2024-07: 60 días visa-free'),
    ('ES', 'MY', 'visa free', 90, NULL),
    ('ES', 'SG', 'visa free', 90, NULL),
    ('ES', 'ID', 'visa on arrival', 30, 'IDR 500K, extendible 30d'),
    ('ES', 'PH', 'visa free', 30, NULL),
    ('ES', 'VN', 'visa free', 45, '2023 update'),
    ('ES', 'IN', 'e-visa', 60, 'eVisa $25-80'),
    ('ES', 'AE', 'visa free', 90, '90/180 GCC'),
    ('ES', 'IL', 'visa free', 90, NULL),
    ('ES', 'TR', 'visa free', 90, '90/180'),
    -- Maghreb (relevante para usuario)
    ('ES', 'MA', 'visa free', 90, NULL),
    ('ES', 'TN', 'visa free', 90, NULL),
    ('ES', 'DZ', 'visa required', NULL, 'Argelia requiere visado a españoles. Excepción: usuario tiene pasaporte DZ propio'),
    ('ES', 'EG', 'visa on arrival', 30, '$25 a la llegada'),

    -- ════════ DZ PASSPORT (Algerian — bastante restrictivo) ════════
    -- Sin visa o visa on arrival
    ('DZ', 'TN', 'visa free', 90, 'Maghreb — visa free'),
    ('DZ', 'MA', 'visa free', 90, 'Maghreb — visa free'),
    ('DZ', 'MR', 'visa free', NULL, 'Mauritania'),
    ('DZ', 'TR', 'visa free', 90, '90/180'),
    ('DZ', 'MY', 'visa free', 30, NULL),
    ('DZ', 'ID', 'visa on arrival', 30, NULL),
    ('DZ', 'JO', 'visa on arrival', 30, NULL),
    ('DZ', 'LB', 'visa on arrival', 30, NULL),
    ('DZ', 'EG', 'visa on arrival', 30, NULL),
    ('DZ', 'IR', 'visa on arrival', 30, NULL),
    ('DZ', 'KE', 'e-visa', 90, NULL),
    ('DZ', 'TZ', 'e-visa', 90, NULL),
    ('DZ', 'RW', 'visa on arrival', 30, NULL),
    ('DZ', 'PH', 'visa free', 30, NULL),
    ('DZ', 'GE', 'visa free', 90, '1 year actually'),
    ('DZ', 'BO', 'visa on arrival', 90, NULL),
    -- Schengen + EU + Anglosphere → todo visa required
    ('DZ', 'AT', 'visa required', NULL, 'Schengen visa needed'),
    ('DZ', 'BE', 'visa required', NULL, 'Schengen'),
    ('DZ', 'FR', 'visa required', NULL, 'Schengen — más solicitada históricamente'),
    ('DZ', 'DE', 'visa required', NULL, 'Schengen'),
    ('DZ', 'IT', 'visa required', NULL, 'Schengen'),
    ('DZ', 'ES', 'visa required', NULL, 'Schengen — usuario tiene pasaporte ES propio, irrelevante'),
    ('DZ', 'NL', 'visa required', NULL, 'Schengen'),
    ('DZ', 'CH', 'visa required', NULL, 'Schengen EFTA'),
    ('DZ', 'GB', 'visa required', NULL, 'UK Standard Visitor Visa £127'),
    ('DZ', 'IE', 'visa required', NULL, NULL),
    ('DZ', 'US', 'visa required', NULL, 'B1/B2 — interview required'),
    ('DZ', 'CA', 'visa required', NULL, 'TRV — paper application'),
    ('DZ', 'NZ', 'visa required', NULL, 'Visitor visa NZD$211'),
    ('DZ', 'AU', 'visa required', NULL, 'Subclass 600 visitor visa'),
    -- LATAM (mayoría visa free para DZ — más permisivos)
    ('DZ', 'BR', 'visa free', 90, NULL),
    ('DZ', 'AR', 'visa required', NULL, NULL),
    ('DZ', 'CL', 'visa required', NULL, NULL),
    ('DZ', 'PE', 'visa required', NULL, NULL),
    ('DZ', 'EC', 'visa free', 90, NULL),
    ('DZ', 'VE', 'visa required', NULL, NULL),
    ('DZ', 'MX', 'visa required', NULL, 'Visa o tarjeta SAE electrónica'),
    -- Asia restante
    ('DZ', 'JP', 'visa required', NULL, NULL),
    ('DZ', 'KR', 'visa required', NULL, NULL),
    ('DZ', 'CN', 'visa required', NULL, NULL),
    ('DZ', 'IN', 'e-visa', 60, NULL),
    ('DZ', 'TH', 'visa on arrival', 15, NULL),
    ('DZ', 'VN', 'e-visa', 30, NULL),
    ('DZ', 'SG', 'visa required', NULL, NULL),
    ('DZ', 'AE', 'visa required', NULL, 'eVisa AED 350'),
    ('DZ', 'SA', 'e-visa', 90, 'Umrah/tourism eVisa'),
    ('DZ', 'IL', 'no admission', NULL, 'Sin relaciones diplomáticas')
ON CONFLICT (passport, destination) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P3 FASE 2 — Savings goals + recurring confidence + intel
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS fin_savings_goals (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    target_amount   NUMERIC(14, 2) NOT NULL,
    current_amount  NUMERIC(14, 2) DEFAULT 0,
    currency        VARCHAR(3) DEFAULT 'NZD',
    target_date     DATE,
    category        VARCHAR(50),     -- 'emergency'|'travel'|'gear'|'tax'|'investment'|'other'
    is_active       BOOLEAN DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_savings_active ON fin_savings_goals(is_active);
CREATE INDEX IF NOT EXISTS idx_savings_target ON fin_savings_goals(target_date);

-- Extiende fin_recurring con confidence + sample_size
DO $$ BEGIN
  ALTER TABLE fin_recurring ADD COLUMN confidence NUMERIC(3,2);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE fin_recurring ADD COLUMN sample_size INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE fin_recurring ADD COLUMN avg_interval_days NUMERIC(6,2);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P5 FASE 2 — Employment profile (matching score base)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS emp_profile (
    id              SERIAL PRIMARY KEY,
    skills          JSONB DEFAULT '[]'::jsonb,        -- ['nodejs','postgres','python',...]
    languages       JSONB DEFAULT '[]'::jsonb,        -- [{lang:'es',level:'native'},{lang:'en',level:'C2'}]
    experience      JSONB DEFAULT '[]'::jsonb,        -- [{role,years,sector,...}]
    preferred_countries TEXT[],
    preferred_sectors   TEXT[],
    min_salary_nzd  NUMERIC(10, 2),
    preferences     JSONB DEFAULT '{}'::jsonb,        -- remote_only, visa_sponsor_required, etc
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed: profile inicial usuario (puede actualizar via PATCH /api/jobs/profile)
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

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P2 FASE 2 — Visa sponsors register (UK + CA LMIA)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS emp_visa_sponsors (
    id              SERIAL PRIMARY KEY,
    country         VARCHAR(2) NOT NULL,
    company_name    VARCHAR(200) NOT NULL,
    city            VARCHAR(100),
    region          VARCHAR(100),
    route           VARCHAR(100),         -- "Skilled Worker", "Global Talent", etc.
    rating          VARCHAR(100),
    source          VARCHAR(40) NOT NULL, -- 'uk_sponsor_register'|'ca_lmia'|'us_h1b'
    imported_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (country, company_name)
);

CREATE INDEX IF NOT EXISTS idx_visa_sponsors_country ON emp_visa_sponsors(country);
CREATE INDEX IF NOT EXISTS idx_visa_sponsors_name_lower ON emp_visa_sponsors(LOWER(company_name));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P1 FASE 2 — Early warning events store (ACLED/USGS/WHO)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS events_store (
    id              SERIAL PRIMARY KEY,
    source          VARCHAR(30) NOT NULL,    -- 'usgs'|'acled'|'who_dons'|'gdelt_cast'
    external_id     VARCHAR(200),             -- source-specific id
    event_type      VARCHAR(50),              -- 'earthquake'|'conflict'|'disease_outbreak'|'protest'
    severity        VARCHAR(20),              -- 'low'|'medium'|'high'|'critical'
    title           VARCHAR(500),
    summary         TEXT,
    country         VARCHAR(2),
    region          VARCHAR(100),
    latitude        NUMERIC(8, 5),
    longitude       NUMERIC(9, 5),
    magnitude       NUMERIC(6, 2),            -- earthquake magnitude o casualty count
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

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P1 FASE 2 — Dedup MinHash+LSH cross-table
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN
  ALTER TABLE rss_articles ADD COLUMN duplicate_of INTEGER REFERENCES rss_articles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE rss_articles ADD COLUMN dedup_similarity NUMERIC(4,3);
EXCEPTION WHEN duplicate_column THEN null; END $$;
CREATE INDEX IF NOT EXISTS idx_rss_dup ON rss_articles(duplicate_of);

DO $$ BEGIN
  ALTER TABLE opportunities ADD COLUMN duplicate_of INTEGER REFERENCES opportunities(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE opportunities ADD COLUMN dedup_similarity NUMERIC(4,3);
EXCEPTION WHEN duplicate_column THEN null; END $$;
CREATE INDEX IF NOT EXISTS idx_opps_dup ON opportunities(duplicate_of);

DO $$ BEGIN
  ALTER TABLE job_listings ADD COLUMN duplicate_of INTEGER REFERENCES job_listings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE job_listings ADD COLUMN dedup_similarity NUMERIC(4,3);
EXCEPTION WHEN duplicate_column THEN null; END $$;
CREATE INDEX IF NOT EXISTS idx_jobs_dup ON job_listings(duplicate_of);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P4 FASE 3b — Embassy DB + consular registration tracker
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS bur_embassies (
    id              SERIAL PRIMARY KEY,
    representing    VARCHAR(2) NOT NULL,    -- País que la embajada representa (ej. ES)
    located_in      VARCHAR(2) NOT NULL,    -- País donde está ubicada (ej. NZ)
    type            VARCHAR(20) DEFAULT 'embassy',  -- 'embassy'|'consulate'|'honorary'
    city            VARCHAR(100),
    address         TEXT,
    phone           VARCHAR(50),
    email           VARCHAR(200),
    url             TEXT,
    hours           VARCHAR(200),
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (representing, located_in, city)
);

CREATE INDEX IF NOT EXISTS idx_embassies_representing ON bur_embassies(representing);
CREATE INDEX IF NOT EXISTS idx_embassies_located ON bur_embassies(located_in);

-- Seed para usuario dual ES/DZ nómada
INSERT INTO bur_embassies (representing, located_in, type, city, address, phone, email, url, notes) VALUES
    -- ES embajadas/consulados en países donde está/estará Ibrahim
    ('ES', 'NZ', 'embassy', 'Wellington', '50 Manners Street, Level 11, Wellington 6011', '+64-4-802-5665', 'emb.wellington@maec.es', 'https://www.exteriores.gob.es/embajadas/wellington', 'Embajada España en NZ — única representación. Sirve también como consulado.'),
    ('ES', 'AU', 'embassy', 'Canberra', '15 Arkana Street, Yarralumla, ACT 2600', '+61-2-6273-3555', 'emb.canberra@maec.es', 'https://www.exteriores.gob.es/embajadas/canberra', 'Embajada principal AU'),
    ('ES', 'AU', 'consulate', 'Sydney', 'Edgecliff Centre, Suite 1, Level 24, 203-233 New South Head Rd', '+61-2-9261-2433', 'cog.sydney@maec.es', 'https://www.exteriores.gob.es/consulados/sydney', 'Consulado General Sydney — más cercano east coast'),
    ('ES', 'DZ', 'embassy', 'Argel', '46 Boulevard Mohamed V, Algiers', '+213-21-92-31-91', 'emb.argel@maec.es', 'https://www.exteriores.gob.es/embajadas/argel', 'CRÍTICO para Ibrahim como ES residente en DZ'),
    ('ES', 'CA', 'embassy', 'Ottawa', '74 Stanley Avenue, Ottawa K1M 1P4', '+1-613-747-2252', 'emb.ottawa@maec.es', 'https://www.exteriores.gob.es/embajadas/ottawa', NULL),
    ('ES', 'GB', 'embassy', 'London', '39 Chesham Place, Belgravia, London SW1X 8SB', '+44-20-7235-5555', 'emb.londres@maec.es', 'https://www.exteriores.gob.es/embajadas/londres', NULL),
    -- DZ embajadas/consulados en países usuario
    ('DZ', 'AU', 'embassy', 'Canberra', '9 Terrigal Crescent, O''Malley, ACT 2606', '+61-2-6286-7355', 'info@algerianembassy.org.au', 'https://www.algerianembassy.org.au', 'Única representación DZ en AU/NZ — CRÍTICO Ibrahim si DZ passport en AU/NZ'),
    ('DZ', 'ES', 'embassy', 'Madrid', 'Calle General Oraá, 12, 28006 Madrid', '+34-91-562-9655', 'ambalg@embajada-argelia.es', 'https://www.embajada-argelia.es', NULL),
    ('DZ', 'FR', 'embassy', 'Paris', '50 Rue de Lisbonne, 75008 Paris', '+33-1-53-93-20-20', NULL, 'https://www.amb-algerie.fr', NULL),
    ('DZ', 'ES', 'consulate', 'Barcelona', 'Rambla de Catalunya, 116, 08008 Barcelona', '+34-93-415-3034', NULL, NULL, 'Consulado DZ Barcelona'),
    ('DZ', 'CA', 'embassy', 'Ottawa', '500 Wilbrod Street, Ottawa K1N 6N2', '+1-613-789-8505', NULL, 'https://www.embassyalgeria.ca', NULL)
ON CONFLICT (representing, located_in, city) DO NOTHING;

-- ─── bur_consular_registrations: registros pendientes ───
-- (registro consular ES, OFII FR, etc — alertas anuales)
CREATE TABLE IF NOT EXISTS bur_consular_registrations (
    id              SERIAL PRIMARY KEY,
    type            VARCHAR(50) NOT NULL,    -- 'registro_consular_es'|'ofii_fr'|'inscripcion_cnib_dz'
    country         VARCHAR(2) NOT NULL,
    embassy_id      INTEGER REFERENCES bur_embassies(id) ON DELETE SET NULL,
    registered_at   DATE,
    expires_at      DATE,
    document_number VARCHAR(100),
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consular_country ON bur_consular_registrations(country);
CREATE INDEX IF NOT EXISTS idx_consular_expires ON bur_consular_registrations(expires_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P6 FASE 2 — VROOM stub + Traccar GPS + PMTiles
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN ALTER TABLE log_routes ADD COLUMN waypoints JSONB; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE log_routes ADD COLUMN polyline TEXT; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE log_routes ADD COLUMN provider VARCHAR(30); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE log_routes ADD COLUMN computed_at TIMESTAMP DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE log_routes ADD COLUMN raw_response JSONB; EXCEPTION WHEN duplicate_column THEN null; END $$;

-- log_gps_positions: pings GPS (Traccar OsmAnd protocol o manual)
CREATE TABLE IF NOT EXISTS log_gps_positions (
    id              SERIAL PRIMARY KEY,
    device_id       VARCHAR(50),
    lat             NUMERIC(9, 6) NOT NULL,
    lon             NUMERIC(9, 6) NOT NULL,
    altitude        NUMERIC(7, 2),
    speed_kmh       NUMERIC(6, 2),
    accuracy_m      NUMERIC(6, 2),
    bearing         NUMERIC(5, 2),
    fix_time        TIMESTAMP NOT NULL,
    source          VARCHAR(30) DEFAULT 'traccar',
    raw             JSONB,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gps_fix_time ON log_gps_positions(fix_time DESC);
CREATE INDEX IF NOT EXISTS idx_gps_device ON log_gps_positions(device_id);

CREATE TABLE IF NOT EXISTS log_devices (
    id              SERIAL PRIMARY KEY,
    device_id       VARCHAR(50) UNIQUE NOT NULL,
    name            VARCHAR(100),
    type            VARCHAR(30),
    last_seen       TIMESTAMP,
    is_active       BOOLEAN DEFAULT TRUE,
    notes           TEXT
);

-- ─── fin_investments: stocks/ETFs/indices via Stooq ──────
CREATE TABLE IF NOT EXISTS fin_investments (
    id              SERIAL PRIMARY KEY,
    symbol          VARCHAR(30) NOT NULL,
    quantity        NUMERIC(20, 8) NOT NULL,
    avg_cost        NUMERIC(14, 4),
    currency        VARCHAR(3) DEFAULT 'USD',
    account         VARCHAR(100),
    notes           TEXT,
    opened_at       DATE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_investments_active ON fin_investments(is_active);
CREATE INDEX IF NOT EXISTS idx_investments_symbol ON fin_investments(symbol);

-- ─── fin_crypto_holdings: positions crypto multi-exchange ───
CREATE TABLE IF NOT EXISTS fin_crypto_holdings (
    id              SERIAL PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL,
    amount          NUMERIC(24, 8) NOT NULL,
    exchange        VARCHAR(50) NOT NULL,   -- 'binance'|'kraken'|'wallet_metamask'|'cold'
    wallet_address  VARCHAR(200),
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (symbol, exchange)
);

CREATE INDEX IF NOT EXISTS idx_crypto_active ON fin_crypto_holdings(is_active);
CREATE INDEX IF NOT EXISTS idx_crypto_exchange ON fin_crypto_holdings(exchange);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P4 FASE 2 — changedetection.io watches gov sites
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS bur_gov_watches (
    id              SERIAL PRIMARY KEY,
    label           VARCHAR(200) NOT NULL,
    url             TEXT NOT NULL,
    country         VARCHAR(2),
    category        VARCHAR(50),    -- 'visa'|'tax'|'consular'|'other'
    cdio_uuid       VARCHAR(80),    -- UUID que devuelve changedetection.io API
    is_active       BOOLEAN DEFAULT TRUE,
    last_changed_at TIMESTAMP,
    last_check_at   TIMESTAMP,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS idx_gov_watches_country ON bur_gov_watches(country);
CREATE INDEX IF NOT EXISTS idx_gov_watches_active ON bur_gov_watches(is_active);

-- Seed: páginas gov críticas para usuario nómada ES/DZ
INSERT INTO bur_gov_watches (label, url, country, category, notes) VALUES
    ('NZ Immigration — Working Holiday', 'https://www.immigration.govt.nz/new-zealand-visas/options/work/thinking-about-coming-to-new-zealand-to-work/working-holiday-visa', 'NZ', 'visa', 'Cambios en condiciones WHV'),
    ('NZ Immigration — Spain WHV', 'https://www.immigration.govt.nz/new-zealand-visas/apply-for-a-visa/about-visa/spain-working-holiday-visa', 'NZ', 'visa', 'WHV específico ES'),
    ('AU Immigration — Working Holiday', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'AU', 'visa', 'Subclass 417 WHV'),
    ('AU Immigration — visa finder', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing', 'AU', 'visa', 'Lista visados'),
    ('ES Exteriores — consulados', 'https://www.exteriores.gob.es/Consulados/argel/es/Comunicacion/Noticias/Paginas/index.aspx', 'ES', 'consular', 'Consulado España en Argel'),
    ('Schengen Visa Info', 'https://www.schengenvisainfo.com/news/', NULL, 'visa', 'Cambios reglas Schengen'),
    ('AEAT — Modelo 720/721', 'https://sede.agenciatributaria.gob.es/Sede/declaraciones-informativas/declaracion-bienes-derechos-extranjero-modelo-720.html', 'ES', 'tax', 'Modelo 720 deadline'),
    ('IRD NZ — IR3', 'https://www.ird.govt.nz/income-tax/income-tax-for-individuals/file-my-individual-tax-return-ir3', 'NZ', 'tax', 'IR3 NZ tax return'),
    ('NZTA Self-Contained Vehicle', 'https://www.nzta.govt.nz/vehicles/vehicle-types/light-vehicles/self-contained-vehicles/', 'NZ', 'visa', 'Green warrant van rules'),
    ('AU Embassy Algiers', 'https://algeria.embassy.gov.au/', 'DZ', 'consular', 'Embajada AU Argelia'),
    ('DZ MAE — visa policy', 'https://www.mae.gov.dz/', 'DZ', 'visa', 'Cancillería Argelia')
ON CONFLICT (url) DO NOTHING;

-- Webhook payloads recibidos de changedetection.io (audit log)
CREATE TABLE IF NOT EXISTS bur_gov_changes (
    id              SERIAL PRIMARY KEY,
    watch_id        INTEGER REFERENCES bur_gov_watches(id) ON DELETE SET NULL,
    cdio_uuid       VARCHAR(80),
    detected_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    diff_summary    TEXT,
    payload         JSONB
);

CREATE INDEX IF NOT EXISTS idx_gov_changes_detected ON bur_gov_changes(detected_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P1 FINALIZATION B1 — Cross-pillar feeds layer
--  2026-04-09: enrich rss_feeds con target_pillar/pillar_topic
--  para que feeds especializados nutran a P2/P3/P4/P5 via
--  bridges (B6). Retrocompatible: feeds existentes mantienen
--  target_pillar=NULL → pipeline P1 puro como hasta ahora.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rss_feeds' AND column_name='target_pillar') THEN
        ALTER TABLE rss_feeds ADD COLUMN target_pillar VARCHAR(4);  -- 'P2'|'P3'|'P4'|'P5' o NULL para P1 puro
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rss_feeds' AND column_name='pillar_topic') THEN
        ALTER TABLE rss_feeds ADD COLUMN pillar_topic VARCHAR(50);  -- hint topic ('layoffs','crypto_policy','visa','grants',...)
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rss_feeds_target_pillar ON rss_feeds(target_pillar) WHERE target_pillar IS NOT NULL;

-- Seed B1: 25 feeds especializados cross-pillar (P2/P3/P4/P5)
-- Composición: 17 LIVE ahora + 4 [CF] (is_active=TRUE, requieren browser
--   fetcher — funcionarán tras migración del server a Windows + Playwright)
--   + 4 [deferred] (is_active=FALSE, requieren custom scraper en B1b).
-- URLs verificadas 2026-04-09 con HEAD/GET + UA navegador real.
-- Sufijo [CF]/[deferred] en `name` para trazabilidad operacional.
-- Categoría 'cross-pillar' distingue del pool OSINT general (P1).
INSERT INTO rss_feeds (url, name, category, target_pillar, pillar_topic, is_active) VALUES
    -- ── P2: Empleo / mercado laboral (6) ──
    ('https://news.crunchbase.com/feed/',                                                       'Crunchbase News',               'cross-pillar', 'P2', 'startup_news',   TRUE),
    ('https://restofworld.org/feed/latest/',                                                    'Rest of World',                 'cross-pillar', 'P2', 'global_tech',    TRUE),
    ('https://news.google.com/rss/search?q=tech+layoffs&hl=en&gl=US&ceid=US:en',                'Google News — tech layoffs',    'cross-pillar', 'P2', 'layoffs',        TRUE),
    ('pseudo://layoffs_fyi',                                                                    'Layoffs.fyi [deferred]',        'cross-pillar', 'P2', 'layoffs',        FALSE),
    ('pseudo://trueup_layoffs',                                                                 'TrueUp Layoffs [deferred]',     'cross-pillar', 'P2', 'layoffs',        FALSE),
    ('pseudo://challenger_report',                                                              'Challenger Report [deferred]',  'cross-pillar', 'P2', 'layoffs',        FALSE),
    -- ── P3: Finanzas / regulación / crypto / FX / bancos centrales (8) ──
    ('https://www.atlanticcouncil.org/feed/',                                                   'Atlantic Council',              'cross-pillar', 'P3', 'crypto_policy',  TRUE),
    ('https://www.coindesk.com/arc/outboundfeeds/rss?outputType=xml',                           'CoinDesk',                      'cross-pillar', 'P3', 'crypto_news',    TRUE),
    ('https://www.dlnews.com/arc/outboundfeeds/rss/',                                           'DL News',                       'cross-pillar', 'P3', 'crypto_news',    TRUE),
    ('https://www.fxstreet.com/rss/news',                                                       'FXStreet [CF]',                 'cross-pillar', 'P3', 'fx',             TRUE),
    ('https://www.fsb.org/feed/',                                                               'Financial Stability Board',     'cross-pillar', 'P3', 'regulation',     TRUE),
    ('https://www.bankofengland.co.uk/rss/news',                                                'Bank of England — news',        'cross-pillar', 'P3', 'central_bank',   TRUE),
    ('https://www.federalreserve.gov/feeds/press_all.xml',                                      'Federal Reserve — press',       'cross-pillar', 'P3', 'central_bank',   TRUE),
    ('https://www.ecb.europa.eu/rss/press.html',                                                'ECB — press releases',          'cross-pillar', 'P3', 'central_bank',   TRUE),
    -- ── P4: Burocracia / visa / inmigración (5) ──
    ('https://www.reddit.com/r/immigration/.rss',                                               'Reddit r/immigration',          'cross-pillar', 'P4', 'visa',           TRUE),
    ('https://workpermit.com/rss.xml',                                                          'WorkPermit.com',                'cross-pillar', 'P4', 'visa',           TRUE),
    ('https://www.federalregister.gov/api/v1/documents.rss?conditions[agencies][]=u-s-citizenship-and-immigration-services&order=newest', 'Federal Register — USCIS docs', 'cross-pillar', 'P4', 'visa_us',        TRUE),
    ('https://www.boe.es/rss/canal.php?c=seccion2b',                                            'BOE Sección II.B',              'cross-pillar', 'P4', 'boe',            TRUE),
    ('https://www.schengenvisainfo.com/news/feed/',                                             'Schengen Visa Info',            'cross-pillar', 'P4', 'visa_eu',        TRUE),
    -- ── P5: Oportunidades / becas / grants / fellowships (6) ──
    ('https://www.profellow.com/feed/',                                                         'ProFellow',                     'cross-pillar', 'P5', 'fellowships',    TRUE),
    ('https://www2.fundsforngos.org/feed/',                                                     'FundsForNGOs',                  'cross-pillar', 'P5', 'grants_ngo',     TRUE),
    ('https://www.ictworks.org/feed/',                                                          'ICTworks',                      'cross-pillar', 'P5', 'dev_grants',     TRUE),
    ('https://archgrants.org/feed/',                                                            'Arch Grants',                   'cross-pillar', 'P5', 'startup_grants', TRUE),
    ('https://reliefweb.int/updates/rss.xml',                                                   'ReliefWeb (UN OCHA)',           'cross-pillar', 'P5', 'grants_dev',     TRUE),
    ('pseudo://grantwatch',                                                                     'GrantWatch [deferred]',         'cross-pillar', 'P5', 'grants',         FALSE)
ON CONFLICT (url) DO UPDATE SET
    name          = EXCLUDED.name,
    category      = EXCLUDED.category,
    target_pillar = EXCLUDED.target_pillar,
    pillar_topic  = EXCLUDED.pillar_topic,
    is_active     = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P1 FINALIZATION B3a — Regional aggregators: Pacific + Caribbean
--  2026-04-09: 15 feeds locales para llevar cobertura nacional de
--  28 a 43 países (sub-bloque del lote B3 que cubre Pacific/Caribbean
--  /MENA/Central Asia/Arctic/Balkans/Africa). category='regional',
--  target_pillar=NULL → P1 puro, alimenta el news pipeline general.
--  URLs verificadas 2026-04-09 con HEAD/GET + UA navegador real.
--  VU Vanuatu Daily Post: marcado active aunque hoy devuelve 429
--  (rate-limit IP Hetzner transitorio, auto-recovery esperado).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO rss_feeds (url, name, category, region, lang, tier, is_active) VALUES
    -- ── Pacific (8) ──
    ('https://www.postcourier.com.pg/feed/',                'Post-Courier (PG)',           'regional', 'PG', 'en', 2, TRUE),
    ('https://www.fbcnews.com.fj/feed/',                    'FBC News (FJ)',               'regional', 'FJ', 'en', 2, TRUE),
    ('https://www.dailypost.vu/feed/',                      'Vanuatu Daily Post',          'regional', 'VU', 'en', 2, TRUE),
    ('https://www.solomonstarnews.com/feed/',               'Solomon Star (SB)',           'regional', 'SB', 'en', 2, TRUE),
    ('https://www.rnz.co.nz/rss/pacific.xml',               'RNZ Pacific',                 'regional', 'WS', 'en', 1, TRUE),
    ('https://matangitonga.to/rss.xml',                     'Matangi Tonga',               'regional', 'TO', 'en', 2, TRUE),
    ('https://www.lnc.nc/rss.xml',                          'LNC (Nouvelle-Calédonie)',    'regional', 'NC', 'fr', 2, TRUE),
    ('https://www.tahiti-infos.com/xml/syndication.rss',    'Tahiti Infos (PF)',           'regional', 'PF', 'fr', 2, TRUE),
    -- ── Caribbean (7) ──
    ('https://www.jamaicaobserver.com/feed/',               'Jamaica Observer',            'regional', 'JM', 'en', 2, TRUE),
    ('https://newsday.co.tt/feed/',                         'Newsday (Trinidad & Tobago)', 'regional', 'TT', 'en', 2, TRUE),
    ('https://ewnews.com/feed/',                            'EyeWitness News (BS)',        'regional', 'BS', 'en', 2, TRUE),
    ('https://www.nationnews.com/feed/',                    'Nation News (BB)',            'regional', 'BB', 'en', 2, TRUE),
    ('https://ayibopost.com/feed/',                         'Ayibopost (HT)',              'regional', 'HT', 'fr', 2, TRUE),
    ('https://www.diariolibre.com/rss/portada.xml',         'Diario Libre (DO)',           'regional', 'DO', 'es', 2, TRUE),
    ('https://en.granma.cu/feed',                           'Granma (CU)',                 'regional', 'CU', 'en', 3, TRUE)
ON CONFLICT (url) DO UPDATE SET
    name      = EXCLUDED.name,
    category  = EXCLUDED.category,
    region    = EXCLUDED.region,
    lang      = EXCLUDED.lang,
    tier      = EXCLUDED.tier,
    is_active = EXCLUDED.is_active;
