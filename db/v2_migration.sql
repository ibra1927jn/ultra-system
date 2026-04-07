-- ╔══════════════════════════════════════════════════════════╗
-- ║  ULTRA SYSTEM v2 — Migration                             ║
-- ║  Idempotente: todo con IF NOT EXISTS                     ║
-- ╚══════════════════════════════════════════════════════════╝

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  AUTH: Users & Sessions
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS auth_users (
    id              SERIAL PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id              TEXT PRIMARY KEY,
    user_id         INT REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  EVENT BUS: Log de eventos
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS event_log (
    id              SERIAL PRIMARY KEY,
    event_type      TEXT NOT NULL,
    source_pillar   TEXT NOT NULL,
    data            JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  NEWS v2: Sources, Articles, Categories
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS news_sources (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL UNIQUE,
    region          TEXT NOT NULL,
    country         TEXT,
    language        TEXT DEFAULT 'en',
    category        TEXT,
    tier            INT DEFAULT 2,
    active          BOOLEAN DEFAULT true,
    last_fetched    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_articles (
    id              SERIAL PRIMARY KEY,
    source_id       INT REFERENCES news_sources(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    url             TEXT UNIQUE NOT NULL,
    summary         TEXT,
    region          TEXT NOT NULL,
    country         TEXT,
    category        TEXT,
    relevance_score INT DEFAULT 0,
    published_at    TIMESTAMPTZ,
    fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_categories (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    slug            TEXT UNIQUE NOT NULL
);

-- Índices news_articles
CREATE INDEX IF NOT EXISTS idx_news_articles_region ON news_articles(region);
CREATE INDEX IF NOT EXISTS idx_news_articles_country ON news_articles(country);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles(category);
CREATE INDEX IF NOT EXISTS idx_news_articles_relevance ON news_articles(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles(source_id);

-- Índices news_sources
CREATE INDEX IF NOT EXISTS idx_news_sources_region ON news_sources(region);
CREATE INDEX IF NOT EXISTS idx_news_sources_active ON news_sources(active);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  SEED: Categories (20)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO news_categories (name, slug) VALUES
    ('Politics', 'politics'),
    ('Economy', 'economy'),
    ('Science', 'science'),
    ('Technology', 'technology'),
    ('AI', 'ai'),
    ('Sports', 'sports'),
    ('Health', 'health'),
    ('Environment', 'environment'),
    ('War & Conflict', 'war-conflict'),
    ('Culture', 'culture'),
    ('Energy', 'energy'),
    ('Space', 'space'),
    ('Physics', 'physics'),
    ('Education', 'education'),
    ('Crypto', 'crypto'),
    ('Business', 'business'),
    ('Entertainment', 'entertainment'),
    ('Travel', 'travel'),
    ('Food', 'food'),
    ('Automotive', 'automotive')
ON CONFLICT (slug) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  SEED: News Sources (RSS feeds)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO news_sources (name, url, region, country, language, category, tier) VALUES
-- WORLD (tier 1)
('Reuters', 'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en-US&gl=US', 'world', NULL, 'en', NULL, 1),
('BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'world', NULL, 'en', NULL, 1),
('Al Jazeera English', 'https://www.aljazeera.com/xml/rss/all.xml', 'world', NULL, 'en', NULL, 1),
('AP News', 'https://feedx.net/rss/ap.xml', 'world', NULL, 'en', NULL, 1),
('DW English', 'https://rss.dw.com/rdf/rss-en-all', 'world', NULL, 'en', NULL, 1),
('France24 English', 'https://www.france24.com/en/rss', 'world', NULL, 'en', NULL, 1),

-- EUROPE (tier 2)
('BBC UK News', 'https://feeds.bbci.co.uk/news/uk/rss.xml', 'europe', 'uk', 'en', NULL, 2),
('El País English', 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada', 'europe', 'spain', 'en', NULL, 2),
('The Guardian UK', 'https://www.theguardian.com/uk-news/rss', 'europe', 'uk', 'en', NULL, 2),
('Der Spiegel International', 'https://www.spiegel.de/international/index.rss', 'europe', 'germany', 'en', NULL, 2),

-- ASIA (tier 2)
('NHK World', 'https://www3.nhk.or.jp/nhkworld/data/en/news/backstory/rss.xml', 'asia', 'japan', 'en', NULL, 2),
('South China Morning Post', 'https://www.scmp.com/rss/91/feed', 'asia', 'china', 'en', NULL, 2),
('Channel News Asia', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml', 'asia', 'singapore', 'en', NULL, 2),
('Times of India', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', 'asia', 'india', 'en', NULL, 2),

-- NORTH AMERICA (tier 2)
('NPR News', 'https://feeds.npr.org/1001/rss.xml', 'north-america', 'usa', 'en', NULL, 2),
('CBC News', 'https://rss.cbc.ca/lineup/topstories.xml', 'north-america', 'canada', 'en', NULL, 2),
('Reuters US', 'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com/world/us&ceid=US:en&hl=en-US&gl=US', 'north-america', 'usa', 'en', NULL, 2),

-- SOUTH AMERICA (tier 2)
('Infobae', 'https://www.infobae.com/arc/outboundfeeds/rss/', 'south-america', 'argentina', 'es', NULL, 2),
('Folha de São Paulo', 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', 'south-america', 'brazil', 'pt', NULL, 2),

-- OCEANIA (tier 2)
('RNZ - Radio New Zealand', 'https://www.rnz.co.nz/rss/news.xml', 'oceania', 'new-zealand', 'en', NULL, 2),
('Stuff NZ', 'https://www.stuff.co.nz/rss', 'oceania', 'new-zealand', 'en', NULL, 2),
('ABC Australia', 'https://www.abc.net.au/news/feed/2942460/rss.xml', 'oceania', 'australia', 'en', NULL, 2),
('Sydney Morning Herald', 'https://www.smh.com.au/rss/feed.xml', 'oceania', 'australia', 'en', NULL, 2),

-- AFRICA (tier 2)
('News24 South Africa', 'http://feeds.news24.com/articles/news24/TopStories/rss', 'africa', 'south-africa', 'en', NULL, 2),
('Daily Nation Kenya', 'https://nation.africa/kenya/rss.xml', 'africa', 'kenya', 'en', NULL, 2),

-- MIDDLE EAST (tier 2)
('Al Jazeera Arabic', 'https://www.aljazeera.net/feed', 'middle-east', 'qatar', 'ar', NULL, 2),
('TRT World', 'https://www.trtworld.com/news/rss', 'middle-east', 'turkey', 'en', NULL, 2)
ON CONFLICT (url) DO NOTHING;
