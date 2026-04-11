-- ════════════════════════════════════════════════════════════
--  P1 Lote A — B5: changedetection.io intel watches
--
--  23 country watches (sin RSS nativo) + 10 policy trackers
--  (Fed/ECB/PBoC/BoJ/RBI/UK/EU/UNSC/IAEA/WH).
--
--  Tabla SEPARADA de bur_gov_watches (P4 burocracia personal)
--  para mantener limpia la separación de pillars. Comparte
--  contenedor changedetection.io vía CDIO API.
--
--  Idempotente: CREATE IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS intel_watches (
  id                  SERIAL PRIMARY KEY,
  label               VARCHAR(200) NOT NULL,
  url                 TEXT NOT NULL UNIQUE,
  country             VARCHAR(2),
  category            VARCHAR(20) NOT NULL,    -- 'country' | 'policy'
  tier                VARCHAR(2),              -- A|B|C|D (priority bucket)
  topic               VARCHAR(50),             -- 'monetary'|'sanctions'|'security'|...
  check_interval_sec  INTEGER NOT NULL DEFAULT 10800,  -- 3h default
  cdio_uuid           VARCHAR(80),
  is_active           BOOLEAN DEFAULT TRUE,
  last_changed_at     TIMESTAMP,
  last_check_at       TIMESTAMP,
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intel_watches_active   ON intel_watches(is_active);
CREATE INDEX IF NOT EXISTS idx_intel_watches_category ON intel_watches(category);
CREATE INDEX IF NOT EXISTS idx_intel_watches_country  ON intel_watches(country);

CREATE TABLE IF NOT EXISTS intel_watch_changes (
  id              SERIAL PRIMARY KEY,
  watch_id        INTEGER REFERENCES intel_watches(id) ON DELETE SET NULL,
  cdio_uuid       VARCHAR(80),
  detected_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  diff_summary    VARCHAR(500),
  payload         TEXT,
  published_to_bus BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_intel_watch_changes_detected ON intel_watch_changes(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_watch_changes_watch    ON intel_watch_changes(watch_id);

-- ─── 10 POLICY TRACKERS (1h cadence = 3600s) ───────────────
INSERT INTO intel_watches (label, url, country, category, tier, topic, check_interval_sec, notes) VALUES
  ('Fed FOMC press releases',         'https://www.federalreserve.gov/newsevents/pressreleases.htm',          'US', 'policy', 'A', 'monetary', 3600, 'Rate decisions, FOMC statements'),
  ('ECB press releases',              'https://www.ecb.europa.eu/press/pr/date/html/index.en.html',           'EU', 'policy', 'A', 'monetary', 3600, 'ECB monetary policy decisions'),
  ('PBoC English news index',         'http://www.pbc.gov.cn/english/130437/index.html',                      'CN', 'policy', 'A', 'monetary', 3600, 'PBoC RRR/rate moves [seed-fix 2026-04-11: 3688110 was 404]'),
  ('BoJ announcements',               'https://www.boj.or.jp/en/announcements/index.htm',                     'JP', 'policy', 'A', 'monetary', 3600, 'BoJ YCC/policy'),
  ('RBI press releases',              'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx',           'IN', 'policy', 'A', 'monetary', 3600, 'RBI repo/CRR'),
  ('UK gov announcements',            'https://www.gov.uk/government/announcements',                          'GB', 'policy', 'A', 'sanctions', 3600, 'HMG sanctions/policy'),
  ('EU Commission news_en',           'https://commission.europa.eu/news_en',                                 'EU', 'policy', 'A', 'sanctions', 3600, 'EU sanctions/trade [seed-fix 2026-04-11: presscorner JS-render]'),
  ('UN Security Council press',       'https://press.un.org/en/security-council',                             'UN', 'policy', 'A', 'security',  3600, 'UNSC resolutions'),
  ('IAEA press releases',             'https://www.iaea.org/newscenter/pressreleases',                        'UN', 'policy', 'A', 'nuclear',   3600, 'IAEA safeguards/nuclear'),
  ('White House statements',          'https://www.whitehouse.gov/briefing-room/statements-releases/',        'US', 'policy', 'A', 'sanctions', 3600, 'POTUS EOs/sanctions')
ON CONFLICT (url) DO NOTHING;

-- ─── 23 COUNTRY WATCHES (3h cadence = 10800s) ──────────────
-- Tier A: hotspot/conflict sin RSS nativo
INSERT INTO intel_watches (label, url, country, category, tier, topic, check_interval_sec, notes) VALUES
  ('KCNA Watch (DPRK proxy)',         'https://kcnawatch.org/',                                               'KP', 'country', 'A', 'security', 10800, 'KCNA aggregator (DPRK has no public RSS)'),
  ('Garowe Online Somalia',           'https://www.garoweonline.com/en',                                      'SO', 'country', 'A', 'conflict', 10800, 'Somalia news aggregator [seed-fix 2026-04-11: hiiraan 404]'),
  ('Radio Tamazuj South Sudan',       'https://www.radiotamazuj.org/en',                                      'SS', 'country', 'A', 'conflict', 10800, 'South Sudan independent news'),
  ('Hurriyet Daily News Turkey',      'https://www.hurriyetdailynews.com/',                                   'TR', 'country', 'A', 'security', 10800, 'Turkey English daily'),
  ('TradeArabia Bahrain',             'https://www.tradearabia.com/news/bh.html',                             'BH', 'country', 'A', 'security', 10800, 'Bahrain regional business [seed-fix 2026-04-11: gdnonline 404]'),
  ('Cyprus Mail',                     'https://cyprus-mail.com/',                                             'CY', 'country', 'A', 'security', 10800, 'Cyprus English daily'),
  ('Tunisia Live (Agence TAP)',       'https://www.tap.info.tn/en',                                           'TN', 'country', 'A', 'security', 10800, 'Tunisia state agency English'),
  ('Srbija.gov.rs press EN',          'https://www.srbija.gov.rs/vest/en',                                    'RS', 'country', 'A', 'security', 10800, 'Serbia gov press EN [seed-fix 2026-04-11: B92 404]'),
  ('Présidence Djibouti',             'https://www.presidence.dj/',                                           'DJ', 'country', 'A', 'security', 10800, 'Djibouti presidence (HoA base hub) [seed-fix 2026-04-11: lanationdj DNS-fail]'),
  ('Maldives Independent',            'https://maldivesindependent.com/',                                     'MV', 'country', 'A', 'security', 10800, 'Maldives English (IOR)'),
  ('Gabon Review',                    'https://www.gabonreview.com/',                                         'GA', 'country', 'A', 'security', 10800, 'Gabon French (post-coup zone)'),
-- Tier B: NATO eastern flank + new accession
  ('LRT Lithuania English',           'https://www.lrt.lt/en/news-in-english',                                'LT', 'country', 'B', 'security', 10800, 'Lithuania public broadcaster English'),
  ('LSM Latvia English',              'https://eng.lsm.lv/',                                                  'LV', 'country', 'B', 'security', 10800, 'Latvia public broadcaster English'),
  ('ERR Estonia English',             'https://news.err.ee/',                                                 'EE', 'country', 'B', 'security', 10800, 'Estonia public broadcaster English'),
  ('The Local Sweden',                'https://www.thelocal.se/',                                             'SE', 'country', 'B', 'security', 10800, 'Sweden English news (NATO new) [seed-fix 2026-04-11: sverigesradio 404]'),
-- Tier C: SE Asia / Pacific pivot
  ('VnExpress International',         'https://e.vnexpress.net/',                                             'VN', 'country', 'C', 'security', 10800, 'Vietnam English daily'),
  ('The Nation Thailand',             'https://www.nationthailand.com/news',                                  'TH', 'country', 'C', 'security', 10800, 'Thailand English news [seed-fix 2026-04-11: bangkokpost EmptyReply]'),
  ('Rappler Philippines nation',      'https://www.rappler.com/nation/',                                      'PH', 'country', 'C', 'security', 10800, 'Philippines news (SCS) [seed-fix 2026-04-11: inquirer 403]'),
  ('RTB News Brunei',                 'https://www.rtbnews.rtb.gov.bn/',                                      'BN', 'country', 'C', 'security', 10800, 'Brunei state TV news [seed-fix 2026-04-11: borneobulletin 403]'),
-- Tier D: EU economic core sin per-country RSS
  ('Gov.ie news',                     'https://www.gov.ie/en/news/',                                          'IE', 'country', 'D', 'economic', 10800, 'Ireland gov news [seed-fix 2026-04-11: rte.ie 403]'),
  ('Government.nl latest news',       'https://www.government.nl/latest/news',                                'NL', 'country', 'D', 'economic', 10800, 'Netherlands gov latest [seed-fix 2026-04-11: nltimes 403]'),
  ('ANSA English Italy',              'https://www.ansa.it/english/',                                         'IT', 'country', 'D', 'economic', 10800, 'Italy news agency English'),
  ('Ekathimerini Greece',             'https://www.ekathimerini.com/',                                        'GR', 'country', 'D', 'economic', 10800, 'Greece English daily')
ON CONFLICT (url) DO NOTHING;
