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
    ('https://www.biobiochile.cl/lista/categorias/nacional.rss', 'BioBioChile (CL)', 'country-cl'),
    ('https://www.eltiempo.com/rss/mundo.xml', 'El Tiempo Internacional (CO)', 'country-co'),
    ('https://gulfnews.com/rss', 'Gulf News (AE)', 'country-ae'),
    ('https://www.koreatimes.co.kr/www/rss/world.xml', 'Korea Times (KR)', 'country-kr'),
    ('https://www.swissinfo.ch/service/rss/all/45926522', 'Swissinfo (CH)', 'country-ch'),
    ('https://english.aawsat.com/feed', 'Asharq Al-Awsat (SA)', 'country-sa'),
    ('https://thethaiger.com/feed', 'The Thaiger (TH)', 'country-th'),
    ('https://www.greekreporter.com/feed/', 'Greek Reporter (GR)', 'country-gr'),
    ('https://www.jpost.com/rss/rssfeedsfrontpage.aspx', 'Jerusalem Post (IL)', 'country-il'),
    ('https://www.inquirer.net/fullfeed', 'Inquirer.net (PH)', 'country-ph'),
    ('https://www.rte.ie/feeds/rss/?index=/news/', 'RTÉ News (IE)', 'country-ie')
ON CONFLICT (url) DO NOTHING;

-- Limpia cualquier duplicado category= que haya quedado del run buggy anterior:
-- mantiene solo la fila más reciente (mayor id) por category
DELETE FROM rss_feeds a USING rss_feeds b
WHERE a.category LIKE 'country-%' AND a.category = b.category AND a.id < b.id;

-- Pseudo-feeds para fuentes no-RSS (GDELT API + Bluesky search)
-- Sirven como source_id para news_apis.js. fetchAll() los skipea por category.
INSERT INTO rss_feeds (url, name, category) VALUES
    ('https://api.gdeltproject.org/api/v2/doc/doc', 'GDELT DOC 2.0 (global)', 'gdelt'),
    ('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts', 'Bluesky Search', 'bsky')
ON CONFLICT (url) DO NOTHING;

-- Keywords prioritarios para alimentar GDELT y Bluesky search (si la tabla está vacía)
INSERT INTO rss_keywords (keyword, weight) VALUES
    ('algeria', 9), ('morocco', 7), ('whv', 8), ('working holiday visa', 9),
    ('immigration nz', 9), ('immigration australia', 8),
    ('modelo 720', 8), ('modelo 721', 8), ('beckham law', 7),
    ('crypto regulation', 7), ('mica', 6), ('dac8', 7),
    ('schengen', 6), ('passport', 5), ('visa policy', 7)
ON CONFLICT (keyword) DO NOTHING;

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
