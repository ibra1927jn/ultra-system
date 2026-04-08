All 7 pillars read. Now I have sufficient information to produce the structured extraction. Let me compose the output.

# Ultra-system v3 — Structured Extraction (Master Doc Input)

Source files (all at `/root/docs/consolidated/`): PILLAR1_NEWS_COMPLETE.md, PILLAR2_EMPLOYMENT_COMPLETE.md, PILLAR3_FINANCE_COMPLETE.md, PILLAR4_BUREAUCRACY_COMPLETE.md, PILLAR5_OPPORTUNITIES_COMPLETE.md, PILLAR6_LOGISTICS_COMPLETE.md, PILLAR7_BIOCHECK_COMPLETE.md. Architecture context: `/mnt/HC_Volume_105271265/repos/ultra-system/docs/ARCHITECTURE.md` and `ULTRA_SYSTEM_AUDIT.md`.

**Global deployment context (from ARCHITECTURE.md + AUDIT):** Hetzner CX23 VPS (2 vCPU, 4 GB RAM, 40 GB SSD, IP 95.217.158.7), Ubuntu + Docker. Previous "Frankenstein" (n8n + Paperless-ngx + Miniflux + Changedetection.io + Homepage + Grafana — 8 containers, ~750 MB RAM) collapsed into "Ultra Engine" monolith: Node.js + Express + node-cron + rss-parser + cheerio + tesseract.js + pdf-parse + node-telegram-bot-api + helmet.js + pg pool + Vanilla HTML/CSS/JS "Glassmorphism" dashboard + PostgreSQL 16 Alpine. ~200 MB RAM total. V1 tables: `document_alerts`, `notification_log`, `uploaded_files`, `rss_feeds`, `rss_articles`, `user_status`, `scheduler_log`, `job_sources`, `job_listings`. Single Express binds port 80; deploy blocked once by "port is already allocated" from legacy Homepage container — resolved by idempotent `deploy.sh`.

---

## PILLAR 1 — NEWS

### 1. Executive summary
Pillar 1 is the consolidated news and early-warning ingestion layer. Current state uses World Monitor (~1,800 RSS feeds, 170 countries), RSSHub for feed generation, GDELT for analysis, keyword-score relevance and Jaccard dedup. The consolidation plan aims for 193/193 country coverage, adds 5 free news APIs (Currents, Newsdata.io, Finlight, NewsAPI.ai, GDELT DOC 2.0) and a full early-warning stack (ACLED, USGS, WHO DONS, GDACS, ReliefWeb, NOAA, ProMED, ICG, FEWS NET). NLP layer upgrades: MinHash+LSH semantic dedup, zero-shot classification (bart-large-mnli), summarization (PEGASUS/BART/T5/LED), multilingual sentiment (FinBERT/VADER/twitter-roberta). Coste total additional: $0/mo. The doc explicitly notes the original detailed design docs (NEWS_PILLAR_DESIGN.md, WORLDMONITOR_INTEGRATION_PLAN.md) are missing, so formal DDL is incomplete.

### 2. APIs
- **Currents API** — currentsapi.services — auth key — free 1,000 req/day; paid Builder $69/mo / Pro $150 / Enterprise $300 — 120 K+ domains, 70+ countries, 20+ languages, real-time, 90 K+ articles/day, 26 M archive.
- **Newsdata.io** — newsdata.io — key — free 200 credits/day (~2 K articles, 12 h delay, commercial allowed); paid Basic $199.99/mo — 87 K+ sources, **206 countries**, 89 languages, sentiment/AI tags, 7 yr history.
- **NewsAPI.ai (Event Registry)** — newsapi.ai — key — free 2 K searches/mo covering 200 K articles; $90/mo 5K plan — 150 K+ sources, 60+ languages, AI enrichment, event detection, data since 2014.
- **Finlight.me** — finlight.me — key — free **10,000 req/mo** — financial/geopolitical focus, boolean queries, source include/exclude.
- **TheNewsAPI** — key — free 100 req/day (3 art/req); paid $19/49/79/mo.
- **GNews API** — key — free 100/day, 12 h delay, 30 d history; paid €49.99/mo — 60K+ sources, 22 languages.
- **WorldNewsAPI** — worldnewsapi.com — free 50 points/day, 1 req/sec; paid $39/379/mo — 210+ countries, 86+ languages, unique front pages of 6K+ publications, MCP support for AI agents.
- **Mediastack** — free 100/MONTH (unusable); $11/mo Standard — 7.5K sources, 50 countries.
- **Perigon News API** — perigon.io — free 150/mo; paid $250/550/mo — 150 K+ sources, 1 M articles/day, full AI enrichment.
- **Newscatcher API v3** — newscatcherapi.com — PAYG $0.01/credit, $50/mo Starter (6K), $500/mo Scale.
- **NewsAPI.org** — "AVOID" — 100/day free, $449/mo paid jump, 55 countries, no ML.
- **GDELT** (already in system) — gdeltproject.org — **no auth, 100% free**. DOC 2.0 (full-text, 3 mo rolling, 65 languages), GEO 2.0 (GeoJSON), TV 2.0 (9+ yr), Context 2.0, **CAST** (Conflict Alert System, forecasting 4 weeks, AUC 86.6–93.7%). QuadClass, GoldsteinScale (-10..+10). Update every 15 min.
- **Google News RSS** — `news.google.com/rss/search?q=QUERY&hl=LANG&gl=COUNTRY` — no auth, free, fragile.
- **Bing News Search API** — **DEAD** (decommissioned Aug 2025).
- **Early warning — all free**:
  - **USGS Earthquakes**: `earthquake.usgs.gov/fdsnws/event/1/query` — GeoJSON/CSV/KML, no auth.
  - **WHO DONS**: `who.int/api/news/diseaseoutbreaknews` — JSON.
  - **ReliefWeb**: `api.reliefweb.int/v1/` (reports, disasters, countries) — free (appname required).
  - **NOAA Weather**: `api.weather.gov/alerts` — no auth.
  - **GDACS**: RSS `gdacs.org/xml/rss.xml` + PyPI `gdacs-api` — 6 min update.
  - **ACLED**: REST API + PyPI `acled` — free for researchers.
  - **ProMED**, **FEWS NET**, **International Crisis Group** — free RSS.
- **Travel advisories**: US State Dept RSS `travel.state.gov/_res/rss/TAs.xml` /TWs/RSS_4787; Australian Smartraveller API `smartraveller.gov.au/destinations-export`; CDC Outbreaks RSS.
- **Podcast Index API** — api.podcastindex.org — free, open-source, key.
- **Listen Notes API** — 300 req/mo free; $200/mo PRO.
- **Apple Podcasts Search** — `itunes.apple.com/search?term=...&media=podcast` — free, no auth.
- **Social-as-news**: Bluesky AT Protocol firehose/Jetstream (free, unrestricted WebSocket), Reddit API (<100 q/min free per OAuth; paid $0.24/1000), Mastodon API (free, open, per-profile `.rss`), Telegram via Telethon/Pyrogram, YouTube Data API v3 (10 K units/day free, RSS native), Twitter/X "AVOID" (paid tiers only; if needed: Twscrape, Apify $5 free credits).

### 3. GitHub repos
- **Crawl4AI** (unclecode/crawl4ai) — 50,000+★ — LLM-ready crawler, anti-bot, Markdown output.
- **news-please** (fhamborg/news-please) — 1,800+★ — crawler + extractor, CommonCrawl.
- **Fundus** (flairNLP/fundus) — high-precision news by publisher.
- **Newspaper4k** — successor to newspaper3k.
- **RSS-Bridge** — 7,000+★ — generate RSS for feed-less sites.
- **NewsBlur** — 6,800+★ — full-featured aggregator with social + training/intelligence.
- **Fusion** — lightweight Go+SQLite aggregator.
- **Glean**, **Yarr** (2,800+★ single binary SQLite), **Kill the Newsletter** (email→Atom/RSS).
- **OSINT Monitor**, **awesome-osint** (jivoi/awesome-osint, 19,000+★), **Social-Media-OSINT-Tools**.
- **SemHash** (MinishLab/semhash) — 2025 semantic dedup.
- **BERTopic** (MaartenGr/BERTopic), **Top2Vec**, **SetFit**, **GLiNER**.
- **changedetection.io** (dgtlmoon/changedetection.io) — 20K+★ (P1 also references 31K★ in P4) — self-hosted web monitor for gov/embassies/regulators.
- **regulatory-pulse** (github.com/i010542/regulatory-pulse) — AI crypto regulation dashboard.
- **Huginn** — open-source IFTTT alt.

### 4. Scrapers / data sources
- World Monitor (~1,800 RSS feeds, 170 countries) — existing base.
- RSSHub (generated RSS for sites without native feeds).
- Regional aggregators: RNZ Pacific (`rnz.co.nz/rss/pacific.xml`), PINA, Pacific Islands Report, Eurasianet, Times of Central Asia, WIC News, Loop Caribbean, AllAfrica (per-country feeds), The Africa Report, Arctic Today, Barents Observer, MENAFN, Middle East Eye, Mideastwire (daily Arabic translations 22 countries), Balkan Insight, SeeNews, Global Voices, EIN Presswire, **Adam Isacson OPML (140+ LatAm RSS)**.
- Multilingual: Agencia EFE, Europa Press, elDiario.es, France 24 (ES/AR/FR), Al Arabiya, Al Jazeera, The New Arab, Jeune Afrique, RFI Afrique, Lusa News Agency, Agência Brasil.
- Pillar-specialized sources: Layoffs.fyi, TrueUp, SkillSyncer, Atlantic Council Crypto Tracker, CryptoSlate, CoinDesk Policy, DL News, CentralBanking.com, ForexNewsAPI, FXStreet, VisaGuide.News, WorkPermit.com, DN Visa Index, Henley Passport Index, USCIS News, GrantWatch, ProFellow, FundsForNGOs, ICTworks, Arch Grants, NomadList, FreakinNomads, Nomad Update, Citizen Remote.
- **changedetection.io** for gov portals without RSS (23 missing countries + policy tracking).

### 5. Containers / services
Not explicitly enumerated beyond "layers": ingestion (RSS, API pollers, social streams, scrapers, early warning, changedetection), NLP enrichment (dedup, translation, NER, topic, sentiment, summarization, fake news), storage, alert dispatcher. No explicit Docker ports. Shares the Ultra-Engine Node monolith + PostgreSQL model.

### 6. DB schema
No formal DDL (sources missing). Derivable: `articles_normalized` (title, URL, source, country, language, date, raw_text, summary, entities, topics, sentiment, fake_score, dedup_hash), `feeds_catalog` (feed URL, region, country, topic, health, last_fetch), `events_store` (early warning: GDELT CAST, ACLED, USGS rows with geo). Integrates with existing `rss_feeds`, `rss_articles` tables from base architecture.

### 7. Cross-pillar mentions
- **P2 Employment**: feeds layoffs/hiring news tracker (Layoffs.fyi, TrueUp, Crunchbase News, Challenger Report, Rest of World, Remotive, Remote OK); cross-reference `emp_listings` with company name badges ("3 recent news about this company").
- **P3 Finance**: feeds crypto/FX news (Atlantic Council, CoinDesk Policy, DL News, Finlight.me, FXStreet, CentralBanking.com, regulatory-pulse).
- **P4 Bureaucracy**: feeds visa/immigration/policy changes (VisaGuide.News, WorkPermit.com, USCIS News, BOE RSS); changedetection.io for gov/embassy sites monitoring (directly referenced as P4 automation).
- **P5 Opportunities**: feeds grants/competitions (GrantWatch, ProFellow, FundsForNGOs, ICTworks, Arch Grants).
- **P6 Logistics + Travel safety**: US State Dept, Smartraveller, GDACS, WHO DONS, ProMED, ICG, FEWS NET.
- **P7 Biocheck / Health**: WHO DONS, CDC Travel, ECDC, ProMED, HealthMap (shared scrapers).
- Mechanism: topic+country+language tags propagate articles to per-pillar inboxes; early-warning events cross Travel+Health+Geo.

### 8. Cost
$0/mo additional (all free tiers, including Currents, Newsdata, Finlight, NewsAPI.ai, GDELT).

### 9. Events / triggers
- Publishes: early-warning events (conflict via GDELT CAST/ACLED, seismic via USGS, disease via WHO DONS/ProMED, disaster via GDACS, travel advisory changes).
- Subscribes: cron-scheduled fetches (30 min for tech, 6 h for general), GDELT 15-min update loop, changedetection.io hooks for gov sites.

---

## PILLAR 2 — EMPLOYMENT

### 1. Executive summary
Pillar 2 is the global presential + remote employment ingestion and tracking system. V1 was hardcoded to NZ via Adzuna; V2 is a **Python(JobSpy sidecar) + Node.js hybrid** covering ~130 countries, 75 sectors, 4 languages (ES/EN/AR/FR). Priority tiers: Tier 1 NZ/AU/ES deep, Tier 2 ~20 countries structured, Tier 3 worldwide. Scoring engine: match/speed/difficulty/total (weighted 50/25/25). Uses **pg-boss** (Postgres-backed queue, no Redis), cheerio/puppeteer, Workday universal JSON pattern as #1 scraper, JobSpy dockerized sidecar for LinkedIn/Indeed/Glassdoor. The doc brags: "When a user searches, ZERO relevant sources are missed."

### 2. APIs
**Tier 1 (Free, no auth JSON)**:
- **Greenhouse** `boards-api.greenhouse.io/v1/boards/{token}/jobs` — ~7,500 companies (Stripe, Airbnb, Rocket Lab, Weta FX).
- **Lever** `api.lever.co/v0/postings/{company}?mode=json` — ~5,000 (Netflix, Twilio).
- **Ashby** `api.ashbyhq.com/posting-api/job-board/{name}` — ~1,500 (OpenAI, Anthropic, Vercel).
- **Workday** POST `{company}.wd{1-5}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs` — **50% of Fortune 500**, ~10,000+ companies.
- **SmartRecruiters** `api.smartrecruiters.com/v1/companies/{id}/postings` — ~4,000 (IKEA, Visa, CERN, Bosch).
- **Workable**, **Recruitee**, **BambooHR**, **Personio** (`{company}.jobs.personio.de/xml`), **Teamtailor**.

**Tier 2 (Free, with key)**:
- **Adzuna** `api.adzuna.com/v1/api/jobs/{country}/search/{page}` — 16-20 countries — 250/day (reports of 1000/hr on some).
- **Reed.co.uk** — UK — Basic Auth, free, max 100/req.
- **USAJobs** `data.usajobs.gov/api/search` — free.
- **EURES** `ec.europa.eu/eures/eures-apps/api/` — 30+ EU/EEA.
- **France Travail** `api.francetravail.io/partenaire/offresdemploi/v2/offres/search` — OAuth2, free.
- **Bundesagentur DE** `rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs` — X-API-Key, free.
- **NAV Norway** `arbeidsplassen.nav.no/public-feed/api/v1/ads` — Bearer, free.
- **Arbetsförmedlingen (JobTech) SE** `jobsearch.api.jobtechdev.se/search` — free, **best-in-class gov data**.
- **Jooble** `jooble.org/api/{key}` — POST, 70+ countries, ~500/day free.
- **ReliefWeb** `api.reliefweb.int/v1/jobs` — global humanitarian, no auth.
- **The Muse**, **Remotive**, **RemoteOK** `remoteok.com/api`, **FindWork** 50/hr, **Jobicy**, **Himalayas**, **CareerJet** affiliate (60+), **Job Bank Canada** `jobbank.gc.ca/api/jobs` (PUBLIC REST + CSV/JSON/XML monthly), **SerpAPI Google Jobs** 100/mo free, **INSPIREhep** (physics), **Singapore MyCareersFuture**, **Trade Me NZ** (developer.trademe.co.nz, free dev OAuth, 500/page), **InfoJobs ES** `api.infojobs.net` (free registration), **HeadHunter hh.ru** (api.hh.ru, OAuth 2.0, **"world-class"**, RU/KZ/UZ), **Trudvsem.ru** open data, **SuperJob** RU, **Jobnet Denmark**, **CareerOneStop**, **Arbeitnow** (has `visa_sponsorship=true` filter!).

**JobSpy sidecar (Python, Dockerized)**: `rainmanjam/jobspy-api` (349★) — REST wrapper with API key auth, rate limiting, proxy support — covers **LinkedIn, Indeed, Glassdoor, Google, ZipRecruiter, Bayt, BDJobs**. Alternative: `speedyapply/JobSpy` (3,089★, the upstream Python lib) or `jobspy-js` (Borgius, Node port).

**Deprecated**: Indeed Publisher (restricted 2019), LinkedIn Jobs API (OAuth partners only), Glassdoor, GitHub Jobs (2021), Stack Overflow Jobs (2022).

### 3. GitHub repos
Tier 1 (core):
- **speedyapply/JobSpy** (3,089★, Python) — cornerstone.
- **PaulMcInnis/JobFunnel** (2,130★, Python) — dedup logic.
- **rainmanjam/jobspy-api** (349★) — **recommended sidecar**.
- **spinlud/py-linkedin-jobs-scraper** (468★), **spinlud/linkedin-jobs-scraper** (180★, TS).
- **alpharomercoma/ts-jobspy** (9★), **DaKheera47/jobspy-node** (2★).
- **rynobax/indeed-scraper** (54★, JS).
- **llorenspujol/linkedin-jobs-scraper** (74★, TS Puppeteer+RxJS).
- **Feashliaa/job-board-aggregator** (22★, JS) — 500K+ positions via Greenhouse/Lever/Ashby/Workday.
- **christopherlam888/workday-scraper** (17★, Python).
- **kbhujbal/go-get-jobs** (33★, Go) — reference arch.
- **qinscode/SeekSpider** (37★, Scrapy for SEEK AU).
- **MohamedMamdouh18/Find-Me-Job** (15★) — AI pipeline scrape+score+cover letters+Notion+Telegram.
- **cboyd0319/JobSentinel** (6★, Rust).
- **debytesio/claude-plugin-jobhunter** (7★).

Tier 2 infra:
- **Gsync/jobsync** (485★, TS) — self-hosted tracker + AI resume + matching.
- **Oscar6/app-tracker** (20★, JS) — **PERN stack exactly like Ultra-system**, study schema.
- **ganainy/VibeHired-ai** (11★, TS) — AI tracker, CV tailoring, ATS scoring, Kanban.
- **hemachandarn/Job-Aggregator** (1★, Jupyter) — Randstad RSS + Adzuna + H-1B.
- **folathecoder/adzuna-job-search-mcp** (11★) — MCP for Adzuna.

Country-specific: **bundesAPI/jobsuche-api**, **navikt/pam-eures-stilling-eksport**, **navikt/pam-stilling-feed**.

Visa sponsorship data:
- **geshal/au-companies-providing-work-visa-sponsorship** (1,843★).
- **Lamiiine/Awesome-daily-list-of-visa-sponsored-jobs** (612★).
- **SiaExplains/visa-sponsorship-companies** (534★, TS).
- **renatoaraujo/uk-visa-sponsors** (7★), **oussamabouchikhi/companies-sponsoring-visas-netherlands** (14★).

Cost of living:
- **zackharley/cost-of-living-api** (27★) — direct Express integration.
- **Joel-Raju/numbeo-scraper**, **djirdehh/react-living-app** (331★), **kelvinxuande/glassdoor-scraper** (71★), **database-of-embassies** (38★).

Curated lists: **tramcar/awesome-job-boards** (1,690★), **emredurukn/awesome-job-boards** (925★), **lukasz-madon/awesome-remote-job** (44,869★).

### 4. Scrapers / data sources
- 5 scraping types: Official APIs, Workday/ATS pattern, JobSpy sidecar, Custom HTML/Puppeteer, CSV/file downloads.
- Custom scrapers needed: Maritime (CrewBay, SeaJobs, Martide, Crewlinker, AllCruiseJobs, V.Ships, Anglo-Eastern, BSM, Wilhelmsen-Workday), Cruise (AllCruiseJobs, MSC, Carnival, NCL iCIMS XML), FIFO/Mining (FIFOjobs.com, iMINCO), Ports (Puertos del Estado, Valencia, Barcelona, DP World Taleo), ETTs (Adecco, Randstad, Manpower, Eurofirms JS-rendered), NZ packhouses (EastPack, Seeka, Trevelyan's, Mr Apple), UAE (GulfTalent, Naukrigulf, Dubizzle via Apify), Chile (Computrabajo, Laborum Cloudflare/SPA), Tecnoempleo (ES RSS), PickNZ/MyJobSpace/MSD NZ/SEPE, SEEK NZ/AU (hard → Adzuna proxy), Indeed (hard → JobSpy or Adzuna), LinkedIn (hard → JobSpy with proxies).
- RSS feeds: Indeed, Craigslist (`{city}.craigslist.org/search/jjj?format=rss`), WWR, Jobicy, RemoteOK, Remotive, Rigzone, HigherEdJobs, Caterer.com, RailStaff, JSfirm, ALA JobList, NHS Jobs, Job Bank Canada, BOE Sección II.B (ES public employment), Opcionempleo, Tecnoempleo, Turijobs, Education Gazette NZ, Jobs.govt.nz, APS Jobs, I Work for NSW, Smart Jobs QLD, EthicalJobs, Oposiciones.net, Totaljobs, IrishJobs.ie, Taleo per-company `/careersection/feed/`, Personio `{company}.jobs.personio.de/xml`, Jobvite `app.jobvite.com/CompanyJobs/Xml.aspx?c={id}`, Finn.no Atom.
- CSV downloads: **UK Sponsor Licence Register** (monthly), **US H-1B Employer Data Hub** (quarterly), **Canada LMIA Positive Employers** (quarterly XLSX/CSV), Job Bank Open Data (monthly), AU Skilled Occupation List, NZ Green List, `database-of-embassies`.

### 5. Containers / services
- **Express backend** (Node.js) — main API + scrapers + normalizer + scoring + crons (node-cron).
- **pg-boss** — PostgreSQL-backed job queue (no Redis).
- **rainmanjam/jobspy-api** — dockerized Python sidecar (LinkedIn, Indeed, Glassdoor, Google, ZipRecruiter, Bayt, BDJobs).
- Scheduled data download workers (UK Sponsor CSV, CA LMIA, visa repos, embassy DB).
- No explicit port mapping.

### 6. DB schema (owned by P2)
- **emp_listings** (big table; see code) — `id, external_id, source, title, company, company_url, location_country/city/region/raw, sector, job_type, is_remote, salary_min/max/currency/period, visa_sponsorship, description, url UNIQUE, emails TEXT[], posted_at, scraped_at, expires_at, match_score, speed_score, difficulty_score, total_score (GENERATED STORED), fingerprint UNIQUE, duplicate_of FK self, is_active`. Indexes on country, sector, total_score DESC, posted_at DESC, fingerprint.
- **emp_portals** — `name, source_type (api|rss|cheerio|jobspy|workday|csv), country, base_url, is_active, fetch_interval, last_fetch, last_scrape_status, error_count, listings_count, config JSONB`.
- **emp_profile** — `skills JSONB, languages JSONB, experience JSONB, preferred_countries TEXT[], preferred_sectors TEXT[], min_salary, preferences JSONB`.
- **emp_applications** — `listing_id FK, status (new|saved|applied|interview|offer|rejected|hidden), applied_at, notes, timeline JSONB`.
- **emp_visa_sponsors** — from CSV imports (UK register, CA LMIA, H-1B).
- **emp_embassies**, **emp_cost_of_living**.
- V1→V2 rename: `job_sources`→`emp_portals`, `job_listings`→`emp_listings`.

### 7. Cross-pillar mentions
- **P1 News ↔ P2**: company mention search in `news_articles` → badge on listing; layoff/hiring news → cross-reference `emp_listings`.
- **P3 Finance ↔ P2**: salary × net-tax estimator (NZ ~0.70, AU ~0.72, ES ~0.65) → "covers X% of your expenses"; country-change cost-of-living differential.
- **P6 Logistics ↔ P2**: relocation cost estimate (NZ→AU ~$2-3k NZD, NZ→ES ~$5-8k NZD); "You already have a flight to Melbourne on 15/05".
- **P4 Bureaucracy ↔ P2**: check required docs vs `document_alerts` ("Visa NZ valid until 2027-01-15 ✓", "Forklift licence not registered ✗").
- **P5 Opportunities ↔ P2**: if no good emp offers → suggest freelance. Cross-pillar cost-of-living data ownership flagged as open question (P2 or P3?).

### 8. Cost
Free. Only cost possible: residential proxies for hard-anti-bot portals (Computrabajo CL, GulfTalent) — optional.

### 9. Events / triggers
- Crons: Adzuna every 4 h, Trade Me / InfoJobs every 6 h, remote APIs every 6 h, aggregator APIs every 8 h, WWR RSS every 1 h, Cheerio every 12 h, JobSpy every 12 h, Workday per company 12-24 h.
- Rate limits: APIs 1 req/sec; JobSpy 1 search/5 min per board; custom 1 req/3 sec random; Workday 1 req/2 sec per company. 3-attempt exponential backoff.
- Telegram alerts for `total_score > 75`.

---

## PILLAR 3 — FINANCE

### 1. Executive summary
Pillar 3 is the central financial OS: banking (manual CSV + Open Banking), multi-currency balances & FX, envelope budgeting, investments (stocks/ETFs/crypto/DeFi/CT4 bot), taxes multi-country (NZ PAYE/FIF, Spain IRPF/Beckham/Modelo 721, Georgia/UAE/Uruguay optimization), freelancer invoicing, remittances (NZD/EUR/USD/DZD corridors — DZD is hard/closed), nomad planning (day counting, tax residency, cost of living, insurance). Architectural influences: Firefly III (ledger model), Actual Budget (integer cents, learn-from-behavior, fuzzy dedup), Maybe Finance (daily NW snapshots), Ghostfolio (TWR/MWR), Lunch Money (recurring detection). Base currency NZD (settable). All monetary values INTEGER (cents). Stack is free except Koinly crypto tax ($49-299/yr).

### 2. APIs
- **GoCardless Bank Account Data (ex-Nordigen)** — gocardless.com/bank-account-data — **FREE, KEYSTONE** — 31 EU/EEA + UK, 2,300+ banks (Spain BBVA/Santander/CaixaBank/Sabadell/ING/Openbank/N26/Bankinter, UK HSBC/Barclays/Lloyds/Monzo/Starling/**Revolut**). API key+secret, 90-day consent. SDKs: `nordigen-python/node/ruby/php`. Integrates natively with Firefly III Data Importer + Actual Budget.
- **Akahu** — akahu.nz / developers.akahu.nz — **FREE dev/hobby tier** — 50+ NZ institutions (ANZ, ASB, BNZ, Kiwibank, Westpac, TSB, KiwiSaver providers, IRD, Sharesies, Hatch). OAuth 2.0 App Token + User Tokens, accounts, balances real-time, transactions with merchant enrichment, identity, payments, income verification, webhooks.
- **Wise** — docs.wise.com/api-docs — **FREE API** — read-only tokens for balances/transactions (no SCA); full tokens need SCA + private key signing. Endpoints `/v4/profiles/{id}/balances`, `/v3/…/borderless-accounts/…/statement.json`, `/v1/rates`, quotes, transfers. ~100 req/min. Sandbox available. **Primary multi-currency source in Phase 1.**
- **Revolut Business (Freelancer plan = FREE)** — developer.revolut.com/docs/business/business-api — OAuth 2.0 + JWT cert, ~100-300 req/min — full REST (accounts, txn, pay, FX, counterparties, webhooks, cards). Personal Revolut: no public API, via GoCardless PSD2 or CSV.
- **Binance API** — binance-docs.github.io/apidocs/spot/en/ — API Key+Secret (HMAC-SHA256), read-only IP-whitelisted for CT4; 1200 weight/min IP, 6000/min orders; testnet `testnet.binance.vision` (spot), `testnet.binancefuture.com` (futures, wiped monthly). Repos: `sammchardy/python-binance` (~5,800★), `jaggedsoft/node-binance-api` (~1,500★), **`ccxt/ccxt` (~41,000★)**.
- **Stripe** — 2.9% + $0.30; WARNING Stripe Atlas LLC owners file Form 5472 annually ($25K penalty). Repos 1.7k/3.7k★.
- **PayPal API**, **Starling Bank UK** (personal tokens direct, gold standard), **Xero** (NZ cloud accounting).
- **CoinGecko API** — 10-50 calls/min free, supports `vs_currencies=nzd`.
- **FX rate APIs**:
  - **fawazahmed0/exchange-api** — FREE UNLIMITED, 200+ currencies, daily. (**Primary**.)
  - **Frankfurter.app** — free unlimited, ECB data, 33 currencies, 20 yr history.
  - **ECB SDMX** — free unlimited.
  - ExchangeRate-API (1,500/mo), CurrencyBeacon (5K/mo), Open Exchange Rates (1K/mo), Fixer.io (100/mo), CurrencyLayer (100/mo).
- **Plaid** (US/CA, limited UK, 100 free), **Tink/Yapily/TrueLayer** (sandbox only), **Salt Edge** (Spectre dev), **Basiq** (AU+NZ).
- **Transfer services**: Wise, Revolut, OFX (190 countries REST), Stripe, PayPal, Payoneer, Deel, XE.com (xecdapi), Western Union (partner), Remitly (partner, no public), Nium (190+).
- **Tax APIs**: IRD NZ Gateway (ird.govt.nz/digital-service-providers), Agencia Tributaria ES (SOAP/XML with e-cert, repo `initios/aeat-web-services` 12★), Avalara AvaTax, TaxJar, Quaderno.
- **Market data**: yfinance (Python unofficial), Alpha Vantage (25/day), Financial Modeling Prep (250/day), **Twelve Data** (800/day, NZX+XMAD, WS streaming — best free), Polygon.io (5/min), CoinGecko, **OpenBB** (OSS, consolidates all).
- **Economic data** (all free): FRED (120 req/min, key), World Bank, OECD, IMF, Eurostat, **RBNZ** (R package CRAN:RBNZ), **Banco de España** (bde.es JSON), ECB (data.ecb.europa.eu SDMX), **DBnomics** (db.nomics.world aggregator).
- **Zerion API** (DeFi, free 3k/day, $149/mo 250k), **DeBank Cloud** (108+ EVM), **Zapper** (GraphQL, 60+ chains).

### 3. GitHub repos
Tier 1 (major, 5K+★):
- **OpenBB-finance/OpenBB** (65,453★, Py) — data backbone.
- **maybe-finance/maybe** (54,059★, Ruby) — complete personal finance.
- **paperless-ngx/paperless-ngx** (37,875★, Py) — receipts archive.
- **actualbudget/actual** (25,812★, TS) — **GoCardless built-in**.
- **firefly-iii/firefly-iii** (22,872★, PHP) — central ledger candidate.
- **ranaroussi/yfinance** (22,676★, Py).
- **midday-ai/midday** (14,139★, TS) — invoicing + time + AI freelancer.
- **invoiceninja/invoiceninja** (9,629★, PHP).
- **akaunting/akaunting** (9,695★, PHP).
- **ghostfolio/ghostfolio** (8,076★, TS) — portfolio TWR/MWR, multi-currency.
- **wallos** (7,654★, PHP) — subscriptions.
- **JerBouma/FinanceDatabase** (7,310★, Py) — 300K+ symbols.

Tier 2 (1-5K★):
- **beancount/beancount** (5,434★, Py), **beancount/fava** (2,432★), **kimai/kimai** (4,584★), **hledger** (4,405★), **gnucash** (4,174★), **FinanceToolkit** (4,581★), **TaxHacker (vas3k)** (4,747★, Py) — AI receipt/invoice, **rotki/rotki** (3,762★, Py) — crypto portfolio + tax + DeFi, **ananthakumaran/paisa** (3,124★), **Bigcapital** (3,587★), **Bagels** (2,732★), **fawazahmed0/exchange-api** (2,224★).

Firefly III ecosystem: firefly-iii (22,872★), data-importer (759★), firefly-pico (881★), abacus (813★), waterfly-iii (632★), firefly-iii-ai-categorize (219★), firefly-iii-fints-importer (210★).

Beancount ecosystem: fava (2,432★), fava-dashboards (372★), smart_importer (303★), beancount-import (463★), double-entry-generator (685★), beanprice, paisa (3,124★).

Crypto/trading: **ccxt/ccxt** (~41,000★), **freqtrade/freqtrade** (~48,400★) — reference for CT4 analytics, **hummingbot** (~18,000★), **Superalgos** (~5,400★), **ranaroussi/quantstats** (~6,900★) — **USE FOR CT4**, **vectorbt** (~7,100★), **backtrader** (~21,000★).

Tax: **BittyTax** (~490★, UK HMRC), **eprbell/rp2** (~380★, multi-country FIFO/LIFO/HIFO), **eprbell/dali-rp2** (~78★).

DeFi portfolios: Rotki, **Xtrendence/Cryptofolio** (~370★), llamafolio-api (~60★), DefiLlama/defillama-server (~220★), zerion-defi-sdk.

Additional: **mayswind/ezbookkeeping** (~4,600★, Go), **moneymanagerex** (~2,200★, C++), **budgetzero** (~650★, Vue), **Tanq16/ExpenseOwl** (~1,400★, Go), **traggo/server** (~1,560★), **basnijholt/net-worth-tracker** (~9★), **WYGIWYH** (829★, Django).

**Total referenced: ~75+ repos, ~415,000+ stars combined.**

### 4. Scrapers / data sources
- **NZ bank CSVs**: ASB, ANZ, Westpac, BNZ, Kiwibank — distinct column formats (ASB YYYY/MM/DD; ANZ/Westpac/BNZ DD/MM/YYYY; Kiwibank DD-MM-YYYY with balance column).
- No NZ bank public APIs (use Akahu).
- Spanish banks all PSD2 via GoCardless (no direct scraping).
- Real estate: Apify + GitHub scrapers for Realestate.co.nz, OneRoof, Idealista (ES).
- Binance testnet JSON dumps.

### 5. Containers / services
No explicit container list; integrates into Ultra-Engine Node monolith. External aggregators: GoCardless (cloud), Akahu (cloud), Wise (cloud), Binance testnet (cloud). Self-host options listed for every tool (Firefly III, Ghostfolio, Rotki, Paperless-ngx) but all marked FREE optional.

### 6. DB schema (owned by P3)
All monetary INTEGER (cents). Tables: **fin_accounts** (asset/liability/expense/revenue type + subtype, currency, institution, iban, meta), **fin_categories** (hierarchical), **fin_transactions** (type income|expense|transfer, amount, currency, amount_nzd, account_id, counter_account, category_id, payee, payee_normalized, imported_id, source csv|wise|akahu|gocardless|manual|ccxt, transfer_id UUID, recurring_id, **document_id** [links P4]), **fin_budgets** (category + YYYY-MM + carryover), **fin_rules** (pre|default|post stages, JSONB conditions/actions), **fin_recurring** (payee, frequency, amount_avg, amount_type fixed|variable|irregular, next_expected, confirmed), **fin_exchange_rates**, **fin_net_worth_snapshots** (daily), **fin_savings_goals**, **fin_payee_aliases**. Indexes on date DESC, account_id+date, unique `(account_id, imported_id) WHERE imported_id IS NOT NULL`.

### 7. Cross-pillar mentions
- **P4 Burocracia → Finance**: document OCR → extract amount/date/provider → auto-create txn. Bidirectional `transaction.document_id ↔ document.transaction_id`. E.g., "NZ medical insurance $450/quarter → next alert 2026-06-15".
- **P2 Empleo → Finance**: salary received vs expected from listing; updates runway+projections; "Savings rate would be X%" simulator; NZ vs ES comparison adjusted for tax & CoL.
- **P6 Logística → Finance**: logistics.cost → pending transaction ("NZ→ES flight $1,800 pending 2026-07"); runway impact; travel budget vs "Trip Spain" goal.
- **P1 Noticias → Finance**: "NZD dropped 2% vs USD this week" dashboard badge.
- **P5 Oportunidades → Finance**: won freelance project → `fin_pending`.

### 8. Cost
$49-299/year (Koinly crypto tax only). Everything else FREE.

### 9. Events / triggers
- Daily FX fetch (Frankfurter/fawazahmed0).
- Daily NW snapshots.
- Envelope budget alerts (60/80/100% thresholds → Telegram warning/danger).
- Recurring detection (interval analysis via `LAG(date) OVER(PARTITION BY payee_normalized)`).
- GoCardless consent refresh every 90 days (Telegram reminder).
- 4-hour crypto snapshots (not real-time).
- Day counter alerts at 150/170/180 days for any country (tax-residency drift).
- Modelo 721 auto-detection at €50K threshold year-end.

---

## PILLAR 4 — BUREAUCRACY

### 1. Executive summary
Pillar 4 manages all life bureaucracy for a dual Spanish/Algerian national van-lifer: personal docs, visas (WHV NZ now, AU next, DN visas), residence, multi-country taxation (ES/NZ/AU/DZ, IRPF, Modelo 720/721, IRNR, CDI), civil registry, driving permits, apostilles, consular registration, crypto compliance (DAC8/MiCA), military service DZ. The doc catalogues WHV for all 6 countries Spain has agreements with, 10 DN visas, step-by-step arrival playbooks for NZ/AU/CA/JP/KR/AR, tax residency rules, Paperless-ngx integration plan with custom fields. Core insight: "No mature doc-tracker exists in GitHub — Ultra-system fills a real gap." Spanish passport is 3rd in Henley index (186 destinations); Algerian passport only for entry/exit to/from Algeria.

### 2. APIs
- **Paperless-ngx REST API** — 5 auth methods (Basic, Session, Token, Remote User, OIDC); full-text `GET /api/documents/?query=...`; custom-field queries `?custom_field_query=[...]`; upload `POST /api/documents/post_document/`; bulk edit; schema browser `/api/schema/view/`. Versions v9/v10 via `Accept` header.
- **Sherpa API** — docs.joinsherpa.io — no free tier — 200+ countries, hourly updates, 100 req/s, sandbox. Gold standard visa requirements.
- **Travel Buddy API** — 120-200 req/mo free; from $4.99/mo.
- **VisaDB API** — contact — 200+ countries, monitors 700+ gov sites.
- **USCIS Case Status API** — US immigration.
- **EU Commission Schengen Calculator** — `ec.europa.eu/assets/home/visa-calculator`.
- **api.data.gov** — 450+ US federal APIs.
- **IRD NZ Gateway** — ird.govt.nz/digital-service-providers (Customer, Account, Income, Address, Period, BIC; sandbox).
- **AEAT ES** — sede.agenciatributaria.gob.es SOAP/XML, requires e-certificate; Verifactu e-invoicing standard; repo `initios/aeat-web-services` (~12★).
- **BOE RSS** — `boe.es/rss/canal.php?c=disposiciones`.
- No public API exists for any country's visa applications — Sherpa/Travel Buddy/VisaDB aggregate via scraping/partnerships.

### 3. GitHub repos
- **paperless-ngx/paperless-ngx** — 37,875★, Python/Django+Angular+Tesseract, GPL-3.0.
- **paperless-ai** — 5,536★ — auto-classify with OpenAI/Ollama, extract dates/types/countries.
- **paperless-gpt** — 2,218★ — LLM Vision OCR for passports/visas.
- **paperless-mobile** — 1,310★, **swift-paperless** — 880★ iOS, **paperless-ngx-postprocessor** — 155★, **paperless-mcp** — 154★ (allows Claude to interact).
- **passport-index-dataset** (ilyankou) — 301★ — 199 countries CSV (best free resource), MIT.
- **passport-index-data** — 51★, **passport-visa-api** — 43★, **visa-req-wiki-scraper** — 16★, **visa-cli** — 23★, **visaverse** — 22★ (3D viz).
- **BittyTax** — 491★ (best OSS crypto tax), **crypto-tax-calculator** — 369★, **simple_taxes** — 53★, **bitcointaxer** — 39★, **hodl-totals** — 36★.
- **Tesseract** — 73,331★, **Stirling-PDF** — 76,311★, **MarkItDown** (Microsoft) — 93,375★, **MinerU** — 58,233★, **surya** — 19,549★ (layout-aware 90+ languages), **OCRmyPDF** — 33,135★, **llm_aided_ocr** — 2,904★.
- **n8n** — 182,648★, **Huginn** — 49,052★, **changedetection.io** — 31,007★, **Home Assistant** — 86,009★.
- **schengencalc** (adambard) — OSS Schengen calculator.
- Doc-expiry trackers: **expatdocs** (0★), **Docuckoo** (1★), **DocBrain** (0★) — **empty space in GitHub**.

### 4. Scrapers / data sources
- **changedetection.io** monitors:
  - `immigration.govt.nz/about-us/policy-and-law/legal-notes` (12 h)
  - `immigration.govt.nz/.../working-holiday-visa` (12 h)
  - `immi.homeaffairs.gov.au/what-we-do/whm-program/latest-news` (12 h)
  - `immi.homeaffairs.gov.au/.../global-visa-processing-times` (24 h)
  - `sede.agenciatributaria.gob.es/Sede/novedades.html` (24 h)
  - BOE código tributario (24 h)
- BOE RSS, WHO DONS (crypto/MiCA monitoring via Finance Magnates feed).
- `urlwatch` (thp/urlwatch), RSS-Bridge, FreshRSS, Miniflux alternatives.

### 5. Containers / services
Proposed stack ("VPS Hetzner/DigitalOcean €5-10/mo"):
- **changedetection.io** (Docker, port 5000) + **playwright-chrome** (browserless/chrome) for JS rendering
- **Paperless-ngx** (Docker) + paperless-ai plugin
- **n8n** (workflows)
- **Radicale** (CalDAV self-hosted)
- **FreshRSS** (aggregator)
- **Uptime Kuma** (monitor)
- Notifications: Telegram Bot + email + ntfy.sh

### 6. DB schema (owned by P4)
- **bur_documents** — `id, document_type (passport|visa|insurance|tax|permit|certificate), country, expiry_date, issue_date, document_number, issuing_authority, status (active|expired|pending_renewal|cancelled), paperless_id (link to OCR file), alert_days INTEGER[] [90,60,30,7], notes, timestamps`.
- **bur_reminders** — `id, reminder_type (document_expiry|tax_deadline|visa_deadline|renewal|custom), related_document_id FK, due_date, alert_dates DATE[], status (pending|sent|acknowledged|dismissed), country, recurring, recurrence_rule (iCal RRULE), timestamps`.

### 7. Cross-pillar mentions
- **P1 News → P4**: legislative change monitoring (inmigración, fiscal, crypto DAC8/MiCA); alert when law change affects profile (WHV NZ, Modelo 720/721 umbrales). Sources: BOE RSS, AEAT novedades, changedetection.io.
- **P2 Employment → P4**: cross-check visa vs employment type; alert if offer incompatible with WHV (NZ: no own business; AU 462: 6-month max same employer); track 88-day AU farm work for extension; link nóminas scanned → Paperless → bur_documents for DASP.
- **P6 Logistics → P4**: before travel verify passport valid (6+ mo), visa validity, apostilla need, insurance; suggest which passport (ES vs DZ); per-country checklist trigger (e.g., Argelia: DZ passport + military status); Schengen calculator if traveling with non-EU partner; cross-check visits vs 183-day rule.
- **P3 Finance → P4**: IRPF, Modelo 210/720/721, DASP, NZ/AU returns, crypto reporting (Binance 172/173, Modelo 721), multi-account conversions (NZ, ES, Wise, Revolut).
- **P7 Health (labeled "P5" in this doc)**: TSE, OVHC, Genki insurance validity per country/visa.

### 8. Cost
~€5-10/mo for VPS (if not using existing Hetzner). Paperless-ngx, changedetection.io, n8n self-hosted FREE. Sherpa API paid only if commercial use needed — probably skip.

### 9. Events / triggers
- Daily cron: verify `bur_documents` WHERE `expiry_date - NOW() IN (90, 60, 30, 7 days)` → Telegram/email/push, update `bur_reminders.status = sent`.
- Tax deadline calendar (.ics) with VALARM TRIGGER:-P14D for Modelo 100, 720/721, NZ 7 July, AU 31 October, etc.
- changedetection.io notification on gov site change.
- Argentina: WHV NZ 2026 apertura **9 April 2026 10:00 NZST** critical event.

---

## PILLAR 5 — OPPORTUNITIES

### 1. Executive summary
Pillar 5 covers every income-generating or career-accelerating opportunity beyond formal employment (which lives in P2): freelance platforms (global+regional, vetted+generalist, MENA+LatAm focus), remote boards, bug bounties (Web2+Web3), hackathons/competitions/prizes, grants (OSS, startup, research), scholarships, free certifications, government programs (ES, EU, MENA, LatAm, Asia, Africa, Oceania), corporate apprenticeships, accelerators/incubators, research/volunteering/NGO, OSS bounties, passive income (micro-SaaS/templates/courses), crypto (bounties, airdrops, testnets, ambassadors), trilingual premium opportunities, consulting/DevRel/technical writing, networks. Strategic advantage of dual ES/DZ + trilingual (ES/EN/AR+FR) + developer + ex-Amazon = unlocks non-overlapping programs. Income stacking target: **$5-8K/mo**, with van-life costs ~$800-1.2K/mo → savings $3-7K/mo. Existing DB tables: `opp_sources`, `opp_listings`, `opp_ideas`.

### 2. APIs
- **Freelancer.com** — developers.freelancer.com — OAuth2, 100 req/min — **already active**.
- **Upwork API** — developers.upwork.com — OAuth2 (slow app approval); **Upwork RSS** fallback.
- **RemoteOK** `remoteok.com/api` — no auth, ~1 req/s.
- **Remotive** `remotive.com/api/remote-jobs` — no auth.
- **Himalayas** `himalayas.app/jobs/api` — no auth, timezone filter.
- **Jobicy** `jobicy.com/api/v2/remote-jobs` — no auth.
- **HackerOne API** `api.hackerone.com/v1` — token + webhooks + RSS.
- **Bugcrowd** — partial API.
- **Intigriti**, **YesWeHack** — RSS only.
- **Huntr** (huntr.com) — $50-$2K+, OSS-specific, low barrier.
- **Immunefi** — no public API; Discord/Twitter for new programs (77.5% of payouts are smart-contract bugs, $100M+ paid, max $10M Wormhole; April 2026 highest: LayerZero $15M, Stargate $10M, Sky $10M).
- **Code4rena**, **Sherlock**, **Hats Finance**, **Spearbit**.
- **Google VRP** (bughunters.google.com $100-100K), **Microsoft MSRC** ($500-100K), **Apple Security Bounty** ($5K-2M), **Meta** ($500-100K), **GitHub** ($200-30K), **Google Patch Rewards OSS** ($100-20K).
- **Devpost API**, **ETHGlobal**, **MLH**, **Colosseum**, **Lablab.ai**, **HackerEarth**, **Unstop**.
- **clist.by** — coding contests aggregator.
- **CTFtime API** `ctftime.org/api`.
- **Kaggle competitions**.
- **Euraxess API** — `euraxess.ec.europa.eu/api` — EU research jobs.
- **EU Funding & Tenders Portal** — `ec.europa.eu/info/funding-tenders`.
- **Scale AI / Remotasks** (remotasks.com), **Outlier AI** (outlier.ai), **Appen**, **Surge AI**, **Toloka** — AI training data, $25-50/h (Arabic premium).
- **GLG Expert Network** — $200-1,000/h calls.
- **DeFi Llama API** `api.llama.fi`, **Layer3**, **Galxe**, **Zealy**, **Superteam Earn** `earn.superteam.fun`, **Dework**, **Jupiter**.
- **GitHub API**, **Torre.ai** (API + MCP server), **GetOnBoard** (public API), **Freelancermap.de** (0% project fee, €14/mo or €50/yr).
- **Devpost, ETHGlobal, Lablab.ai, Unstop, Automattic, Founder Institute** — continuous/rolling.

### 3. GitHub repos
Job hunting (shared with P2):
- **speedyapply/JobSpy**, **ts-jobspy**, **PaulMcInnis/JobFunnel**, **feder-cr/Auto_Jobs_Applier_AIHawk**, **Gsync/jobsync**, **wodsuz/EasyApplyJobsBot**.

Bug bounty tools:
- **projectdiscovery/nuclei** (20K+★), **nahamsec/Resources-for-Beginner-Bug-Bounty-Hunters** (10K+★), **EdOverflow/bugbounty-cheatsheet** (5K+★), **KathanP19/HowToHunt** (6K+★), **yogeshojha/rengine** (4.5K+★, HackerOne sync), **six2dez/reconftw** (7.3K+★).

OSS/grants/funding:
- **nayafia/lemonade-stand** (7K+★), **nayafia/microgrants**, **ossfriendly/open-source-supporters**, **ralphtheninja/open-funding**, **opensource-observer/oss-funding**, **FreeCodeCamp/how-to-contribute-to-open-source** (8K+★), **weecology/ogrants**, **deacs11/CrewAI_Grant_Funding_Finder**, **sustainers/awesome-oss-funding**.

Indie/passive:
- **mezod/awesome-indie** (9K+★), **PayDevs/awesome-oss-monetization**, **255kb/stack-on-a-budget** (12K+★), **johackim/awesome-indiehackers** (560+★), **yourincomehome/awesome-passive-income**, **polarsource/polar**.

Crypto:
- **ccxt/ccxt** (33K+★), **freqtrade/freqtrade** (28K+★), **hummingbot** (14K+★), **DeFiHackLabs/Web3-Security-Library** (2K+★).

Freelance tools:
- **midday-ai/midday**, **solidtime-io/solidtime**, **kimai/kimai** (1K+★), **engineerapart/TheRemoteFreelancer**.

SaaS boilerplates: **async-labs/saas** (3.5K+★), **ixartz/SaaS-Boilerplate** (1.5K+★), **apptension/saas-boilerplate** (1K+★), **smirnov-am/awesome-saas-boilerplates**.

Content/education: **classroomio/classroomio** (1.4K+★), **p2pu/course-in-a-box**.

Remote-ES: **remote-es/remotes** (2.8K★) — Spanish-contract 100% remote companies.

### 4. Scrapers / data sources
- **changedetection.io** (reused from P4) for grants, bounties, hackathons pages.
- **n8n** (reused) — API→filter→notify workflows.
- Puppeteer/Playwright for JS-heavy sites.
- Cheerio for static pages.
- `rss-parser` npm + `node-cron`.
- 9 RSS feeds from remote boards (WWR, Remotive, Working Nomads, DailyRemote, Remote.co, RemoteOK, Hacker News Algolia Jobs search).

### 5. Containers / services
Daily Node.js `opp_fetcher` cron at 06:00 NZT using 4 APIs + 9 RSS + scrapers. Telegram bot for score>70 alerts. No explicit Docker container list — folds into Ultra-Engine.

### 6. DB schema (owned by P5)
- **opp_sources** — `name, url, type (api|rss|scrape|manual), category (§2 taxonomy), api_endpoint, api_auth_type (none|api_key|oauth2), api_key encrypted, fetch_frequency (hourly|daily|weekly), last_fetched, filters JSONB, enabled, priority 1-5, notes`.
- **opp_listings** — `source_id FK, external_id, title, description, url, category, tags TEXT[], salary_min/max, currency, payout_type (hourly|fixed|monthly|bounty|prize), deadline, company, location, language_req TEXT[], status (new|interested|applied|rejected|won|expired), match_score 0-100, applied_at, notes, first_seen, last_seen`.
- **opp_ideas** — `title, description, category (micro_saas|template|course|api|content|tool), effort (weekend|1_week|1_month|3_months), revenue_model (subscription|one_time|usage_based|ads|affiliate), revenue_estimate_monthly, status (idea|validating|building|launched|abandoned), stack TEXT[], competitors, unique_angle, priority, notes, timestamps`.

### 7. Cross-pillar mentions
- **P2 Employment**: job offers flow → employment pipeline; dual-nationality strategy → eligibility flags.
- **P3 Finance**: earnings per source tracked; ROI per opportunity; currency conversions (Wise/Revolut/Binance).
- **P4 Bureaucracy**: grant deadlines → `bur_reminder`; scholarship deadlines; visa implications (WHV, e-Residency Estonia, Singapore EntrePass, Thailand DTV, Malaysia DE Rantau).
- **P7 Health ("P1 Health" in the doc)**: MSF/UN Volunteer insurance implications.
- Reuses **changedetection.io** and **n8n** from P4.

### 8. Cost
Free (uses existing P4 infra). GLG/Toptal/Scale AI/Outlier have no signup fees. Freelancer.com: 10% or $5/mo membership. Malt.es 10%→5%→2%. Freelancermap.de €14/mo or €50/yr.

### 9. Events / triggers
- Daily 06:00 NZT fetcher cron.
- Telegram notification for `match_score > 70`.
- Weekly email digest.
- Grant-deadline detection → creates P4 `bur_reminder`.
- Airdrop/testnet tracker watches DeFi Llama protocols without tokens.
- Key deadline events: NLnet NGI Zero Commons Fund 1 Jun 2026 12:00 CEST, Solana Colosseum 6 Apr–11 May 2026, ETHGlobal Open Agents 2 Apr–6 May 2026, Vinnova 21 Apr 2026, Business Finland Sprint 2 Mar–31 Aug 2026, Canada SUV grace 30 Jun 2026, DE Rantau 0% tax expires end 2026.

---

## PILLAR 6 — LOGISTICS

### 1. Executive summary
Pillar 6 manages physical movement, shelter and in-place logistics for long-term van-life nomads: transport (van, flights, trains, buses, ferries, crewing, hitch, driveaway), accommodation (paid, housesit, work-exchange, hospitality, camping), storage, shipping/mail, weather, road conditions, connectivity, travel security. Built on PostgreSQL/PostGIS/pgRouting with existing tables `log_locations`, `log_routes`, `log_events`. Offline-first (PMTiles + Service Worker + Dexie.js) because van has poor connectivity. Key hard constraint: **NZ Self-Contained Motor Vehicles Act — 7 June 2026 final deadline, blue warrants expire, only green valid, fixed toilet mandatory since Dec 2023**. Strategy uses Spanish passport always (EU supremacy), Workaway+MindMyHouse+WWOOF-NZ+HelpX baseline ~$170/yr memberships.

### 2. APIs
- **Overpass API (OSM)** `https://overpass-api.de/api/interpreter` — **FREE, no auth** — camp_sites, drinking_water, dump_stations, showers, toilets, fuel. Tags: `tourism=camp_site/caravan_site`, `amenity=sanitary_dump_station/drinking_water/water_point/shower/toilets/fuel`.
- **DOC NZ Open Data** — `catalogue.data.govt.nz/dataset/doc-campsites2`, `doc-deptconservation.opendata.arcgis.com` — Shapefile/KML/GPX/GeoJSON/ESRI REST/OGC WFS, weekly updates, FREE no auth, ~250 DOC campsites.
- **iOverlander** (ioverlander.com) — global camps — CSV/KML/GPX/JSON exports, free.
- **Park4Night unofficial API** (github.com/gtoselli/park4night-api) — `https://guest.park4night.com/services/V4.1/lieuxGetFilter.php?latitude=X&longitude=Y` — 200 nearby lieux, no auth.
- **NZTA Traffic** — REST JSON, free registration.
- **Open-Meteo** — open-meteo.com — FREE no key, global weather + marine.
- **NIWA Tides** — NZ — free API key.
- **Gaspy (unofficial)** — cory-evans/gaspy — NZ fuel REST JSON.
- **OpenChargeMap** — REST JSON, FREE no auth, global EV.
- **WiFi Map** — `data.wifimap.io` — 150M+ hotspots, agreement.
- **OpenCellID** — global cell towers, registration, FREE CC.
- **PVWatts (NREL)** — solar production calc, FREE API key.
- **Kiwi Tequila** — flights, API key, FREE (includes `/nomad` multi-city mode — **no other API does this cleanly**).
- **Amadeus** — flights, OAuth2, 2K req/mo free.
- **Duffel** — flights, Bearer, 1,500 bookings/mo free.
- **FlixBus** — EU buses, API key, FREE.
- **BlaBlaCar** — REST, API key, FREE.
- **Direct Ferries** / **Ferryhopper** (+MCP) — partner REST.
- **Deutsche Bahn** — trains, FREE open API.
- **TuGo Travel** — travel safety REST, FREE.
- **Smartraveller** (AU), **US State Dept**, **FCDO UK** (data.gov.uk) — travel alerts FREE.
- **GlobalPetrolPrices** — 135 countries, REST JSON, subscription PAID.
- **Windy** — wind/waves, REST + Leaflet, API key, free dev.
- **Stormglass** — marine, 10 req/d free.
- **Numbeo** — cost of living, $50-500/mo.
- **Nomad List gems** — paid subscription.
- **Open Food Facts**, **USDA FoodData**, **FatSecret** — food/nutrition (van kitchen).
- **fawazahmed0 Exchange API** — FX FREE unlimited.
- **Open Charge Map**, **Chargetrip** (EV routing free), **TomTom EV**, **Chargeprice**.
- **HitchWiki Data** (REST), **HitchWiki HF Dataset** (huggingface).
- **REFUGE Restrooms** REST, **Freedge** (community fridges, no API).

### 3. GitHub repos
Routing (all Docker self-host):
- **Project-OSRM/osrm-backend** — 7,614★, demo only cloud.
- **graphhopper/graphhopper** — 6,397★ — **RECOMMENDED** for van (full restrictions + Custom Model).
- **valhalla/valhalla** — 5,596★ — truck costing, /optimized_route.
- **GIScience/openrouteservice** — 1,865★ — toll/ferry avoidance.
- **pgRouting/pgrouting** — 1,384★ — **routing inside Postgres**.
- **VROOM-Project/vroom** — 1,200+★ — multi-stop optimization.

Maps/tiles: **protomaps/PMTiles**, **maptiler/tileserver-gl**.

Travel planners:
- **mauriceboe/TREK** — ~3,300★ — **architectural reference**, self-hosted PWA, Leaflet, WebSocket, Open-Meteo.
- **seanmorley15/AdventureLog** — ~2,828★ — travel tracker + flights + GPX + 3D.
- **traccar/traccar** — ~6,000★ — GPS, 200+ protocols, REST API.

Camping/POI:
- **giggls/opencampsitemap**, **GpxFeed/campgrounds**, **mwiede/camping-poi**, **cory-evans/gaspy**, **gtoselli/park4night-api**.

Flights: **broadtoad/Flight_Tracker**, **jeancsil/flight-spy**, **kcelebi/flight-analysis**, **Arthraj/Flight-Price-Tracker** (MERN), **2BAD/ryanair**, **projectivemotion/wizzair-scraper**, **AWeirdDev/flights**.

Offline-first: **pazguille/offline-first**, **Dexie.js**, **allartk/leaflet.offline**.

Scrapers: **lukem512/freecycle**, **emileswarts/freestuffly**, **robmsmt/freecyclescraper**, **scrapehero-code/booking-hotel-scraper**, **arrrlo/BlaBlaCar-Client-Api**, **jessehanley/nomadlist-gem**.

Curated: **cbovis/awesome-digital-nomads**, **awesomelistsio/awesome-digital-nomads**, **Couchers-org/couchers**.

Buses: **juliuste/flix**.

Food: **mealie-recipes/mealie**, **mitchellciupak/auto-kitchen**.

### 4. Scrapers / data sources
- DOC NZ Open Data (weekly fetch).
- Overpass for current region (camp_sites, drinking_water, dump_stations).
- iOverlander per-country.
- Park4Night unofficial endpoint.
- Workaway, Trustedhousesitters, WWOOF, HelpX (where ToS permit, else RSS or manual) — concerns noted in open questions.
- Kiwi House Sitters (NZ), MindMyHouse, BeWelcome, Couchers.
- Flight spies (broadtoad, flight-spy).

### 5. Containers / services
Explicit Docker stack:
- **GraphHopper** (Docker, port 8989) — van routing 2.5 m / 3.5 t Custom Model.
- **VROOM** (Docker) — multi-stop optimization.
- **tileserver-gl** (Docker) + PMTiles.
- **Traccar** (Docker) — GPS tracking.
- Frontend: MapLibre GL JS or Leaflet + markercluster + leaflet.offline + Service Worker + IndexedDB (Dexie.js).

### 6. DB schema (owned by P6)
- **log_locations** (extend existing) — `id, name, latitude, longitude, geom GEOMETRY(Point, 4326), type (campsite|parking|dump_station|water|shower|fuel|wifi|mechanic|housesit|workaway|hostel|coworking|gurdwara|monastery|storage), country, region, source (osm|ioverlander|doc_nz|manual|park4night|workaway|trustedhousesitters|wwoof|bewelcome), source_id, cost, currency, is_free, rating, has_water, has_dump, has_shower, has_wifi, has_power, is_self_contained_only, notes, visited, visited_at, photos TEXT[], timestamps`.
- **log_routes** (extend) — `origin_id, destination_id, waypoints JSONB, distance_km, duration_hours, fuel_cost, toll_cost, route_geom GEOMETRY(LineString, 4326), transport_type (van|flight|ferry|bus|train|walk|crew|hitch), provider (graphhopper|osrm|manual|kiwi|flixbus|interislander|bluebridge|amadeus), avoid_tolls, avoid_ferries, vehicle_profile JSONB, notes, completed, completed_at`.
- **log_services** (new) — `location_id FK, type (water|dump|shower|laundry|wifi|fuel|lpg|mechanic|storage|mail|parcel_locker), name, cost, currency NZD, is_free, hours, quality_rating 1-5, last_verified`.
- **log_stays** (new) — `location_id FK, platform (workaway|worldpackers|wwoof|trustedhousesitters|mindmyhouse|bewelcome|couchers|nomador|helpx|findacrew|vipassana|esc), host_name/url, start_date, end_date, nights, hours_per_day, tasks, provided TEXT[], cost DEFAULT 0, rating, status (applied|confirmed|in_progress|completed|cancelled)`.
- **log_memberships** (new) — `platform, annual_cost, currency, renews_at, credentials_ref, notes`.

### 7. Cross-pillar mentions
- **P3 Finance**: fawazahmed0 Exchange API → FX for country budgets; Numbeo+Nomad List → P3 budget allocator; Wise/Revolut ATM/DCC rules; Argentina post-cepo special flag; Tanzania TZS-only 2025 flag; Korea wolse-not-jeonse housing deposit logic.
- **P4 Bureaucracy/Visas**: visa validity windows; Schengen 90/180 counter for DZ passport edge cases; WHV → 88-day harvest → 2nd AU WHV → DN visa picker; **IMEI Turkey 120-day rule** auto-warn; ESC if ≤30.
- **P7 Biocheck/Health**: altitude (Cusco 3,400 m, La Paz 3,640 m, Annapurna/EBC); Delhi belly / Bali belly food rules; moto insurance flag for TH/VN/ID/SL/KH/IN; Cape Town night rule; Poblado drink-spiking rule; TSE/EHIC; SafetyWing linkage; Dhamma Vipassana.
- **"P2 Tasks/Timeline" (doc numbering)**: housesit deadlines, workaway confirmations, ferry bookings, visa expirations.
- **"P5 Knowledge/Memory" (doc numbering)**: location notes/photos feed knowledge base.

### 8. Cost
Target: live free/near-free. Infrastructure FREE (self-hosted GraphHopper/VROOM/tileserver-gl/Traccar). Subscription baseline ~$170/yr (Workaway + MindMyHouse + WWOOF-NZ + HelpX). Paid APIs only: GlobalPetrolPrices, Numbeo. Everything else FREE (Overpass, DOC NZ, Open-Meteo, OpenChargeMap, Kiwi Tequila).

### 9. Events / triggers
- Weekly POI fetcher (DOC NZ + Overpass + iOverlander).
- Notify when new campsite <20 km from current location.
- Trip planner on-demand (GraphHopper + VROOM + Open-Meteo forecast + Gaspy prices).
- Flight monitor cron → Kiwi `/nomad` + Amadeus cheapest → Telegram alert under threshold.
- Housesit/Workaway scrape or RSS → score against travel plan → high-score alert → on accept insert `log_stays`.
- Cost-of-living rebalance cron (Numbeo/Nomad List vs P3 finance balance).

---

## PILLAR 7 — BIO-CHECK / HEALTH

### 1. Executive summary
Pillar 7 handles every aspect of physical, mental, sexual, and environmental health for a dual Spanish/Algerian van-life nomad doing physical seasonal work (warehouse/farm) across WHV countries (NZ → AU) plus budget destinations (SEA, LatAm, Europe). Tracks personal health metrics (sleep, HR, HRV, weight, body comp, mood, nutrition, hydration, habits, workouts) from wearables + manual logs into `bio_entries`/`bio_goals` (schema migration pending: `meals INT → JSONB`). Integrates regional health risks, vaccination requirements, disease outbreaks via scraper stack (WHO DON + CDC + ECDC + ProMED + MAEC). Self-hosted apps: wger (fitness), Mealie/Grocy/Tandoor (nutrition), fasten-onprem (medical records). Van-life specifics: CO detector, water autonomy, first-aid kit, ergonomics. **NEVER substitute professional medical advice.** Key insight: Spanish speaker → LatAm therapy $10-25/session; Algerian passport → cheap OTC meds/dental/blood tests in N.Africa/Turkey.

### 2. APIs
- **USDA FoodData Central** — `api.nal.usda.gov/fdc/v1/` — free unlimited, key (DEMO_KEY for testing) — complete nutrients, 5K+ foods.
- **Open Food Facts** — `world.openfoodfacts.org/api/v2/product/{barcode}.json` — no auth, 3M+ products, Nutriscore.
- **CalorieNinjas** — calorieninjas.com/api — 10K/mo free — NL parsing.
- **wger** — wger.de/api/v2/ — token auth (public reads no auth) — 896 exercises, 8 categories, 15 muscles (SVG), 11 equipment; endpoints `/exercise/`, `/exerciseinfo/{id}/`, `/routine/`, `/workoutsession/`, `/workoutlog/`, `/nutritionplan/`, `/meal/`, `/weightentry/`, `/measurement/`.
- **Fitbit** — dev.fitbit.com — OAuth 2.0 — HR, steps, sleep, SpO2, weight.
- **Oura** — cloud.ouraring.com/docs — OAuth 2.0 — sleep, HRV, temp, readiness.
- **Withings** — developer.withings.com — OAuth 2.0 — weight, body comp, sleep, BP.
- **OpenUV** — openuv.io — free, API key — real-time UV index.
- **Open-Meteo** — free, no key — weather + marine (shared with P6).
- **FatSecret** — platform.fatsecret.com — OAuth — 56 countries nutrition.
- **Spoonacular** — 150 pts/day — meal planning.
- **Edamam** — 100-200/day, Key+ID — recipe analysis.
- **Sleep as Android SleepCloud** — OAuth 2.0.
- **Nutritionix** — 50/day — NL + restaurants.
- **HCGateway** (self-hosted, github.com/ShuchirJ/HCGateway, 392★) — Android Health Connect bridge.
- **WHO DON** — (shared with P1 news) scrapeable.
- **CDC Travel** — `wwwnc.cdc.gov/travel` — JSON-scrapeable, levels 1-4 per country + vaccine reqs.
- **ECDC** — `ecdc.europa.eu` — EU disease threats, weekly threat reports.
- **ProMED-mail** — email/RSS.
- **HealthMap** — `healthmap.org` — free API/RSS.
- **IQAir AirVisual** — `api.waqi.info` token — real-time AQI + forecast.
- **OpenAQ** — `openaq.org` — free open data.
- **World Air Quality Index** — aqicn.org/api — free token.
- **IAMAT** — `iamat.org` — English-speaking doctors directory, free.
- **ExerciseDB (RapidAPI)** ~100 req/day, **API Ninjas Exercises** 10K req/mo.

### 3. GitHub repos
Fitness:
- **Snouzy/workout-cool** — 7,175★, Next.js + PostgreSQL + Prisma, Docker, REST.
- **wger-project/wger** — 5,912★ — Django+Vue, Docker, complete REST.
- **SamR1/FitTrackee** — ~1,100★ — FastAPI+Vue+PostgreSQL, Docker.
- **endurain-project/endurain** — ~200★ — Docker-native, Strava/Garmin integration.
- **yuhonas/free-exercise-db** — static DB with images.
- **workout-lol/workout-lol**.

Nutrition/recipes:
- **mealie-recipes/mealie** — 11,898★, FastAPI+Vue+PostgreSQL, Docker, REST.
- **grocy/grocy** — 8,917★, PHP — **fridge inventory + expiry**, ideal for small van fridge.
- **TandoorRecipes/recipes** — 8,134★, Django+Vue+PostgreSQL.
- **simonoppowa/OpenNutriTracker** — 1,683★, Flutter + OFF + USDA, offline.

Mental health:
- **HabitRPG/habitica** — 13,793★ — gamified RPG.
- **iSoron/uhabits (Loop)** — 9,798★ — #1 Android habit tracker.
- **oppiliappan/dijo** — 2,915★ terminal habit tracker.
- **daya0576/beaverhabits** — 1,730★ self-hosted.
- **meditohq/medito-app** — 1,214★.
- **heylinda/heylinda-app** — 721★.
- **open-nomie/nomie5** — 559★ personal journal.
- **wifizak/inbreeze** — 99★ Wim Hof breathing.

Unified health/wearables:
- **fastenhealth/fasten-onprem** — 2,637★ — personal health record, 650+ providers (USA-centric extensible), Docker, GPL.
- **Freeyourgadget/Gadgetbridge** — 4,494★ — companion for Mi Band, Amazfit, etc.
- **the-momentum/open-wearables** — 551★ — unified API for Apple Health/Garmin/Polar/Whoop, Docker, MIT.
- **ShuchirJ/HCGateway** — 392★.
- **tcgoetz/GarminDB** — Garmin Connect → SQLite.

Sleep: **HypnosPy/HypnosPy** — sleep/circadian analysis Python. **hello-nyxo/nyxo-app** — 302★.

Awesome lists: **woop/awesome-quantified-self**, **Dieterbe/awesome-health-fitness-oss**, **kakoni/awesome-healthcare** — 3,726★.

### 4. Scrapers / data sources
- Daily scraper cron: WHO DON + CDC Travel + ECDC + Spanish MAEC → `health_alerts` keyed by country ISO.
- IQAir AirVisual / OpenAQ / WAQI for air quality forecast.
- OpenUV + Open-Meteo daily fetch.
- Parkrun results scrape from `parkrun.me/<id>` (flagged as open question).
- Spanish `Historia Clínica Digital del SNS` (HCDSNS) via Mi Carpeta Ciudadana or regional sites (Madrid AMIS, Catalunya La Meva Salut) — manual PDF import.

### 5. Containers / services
Docker compose (explicit snippet):
- **wger** (port 8001:80).
- **mealie** (port 8002:9000, `DB_ENGINE=postgres`).
- **grocy** (port 8003:80, linuxserver/grocy).
- **fasten-onprem** (port 8004:8080).
- Node.js middleware integrates all into PostgreSQL `bio_entries`, `bio_goals`, `health_alerts`, `health_documents`, `vaccinations`.

### 6. DB schema (owned by P7)
- **bio_entries** (extend existing) — `date, weight_kg, body_fat_pct, sleep_hours, sleep_quality 1-10, sleep_data JSONB {phases:{deep,light,rem}, hrv}, meals JSONB (MIGRATE from INT) [{name, calories, protein, carbs, fat, time}], water_ml, exercise JSONB [{type, duration_min, sets, reps, notes}], mood 1-10, mood_notes, energy 1-10, steps, heart_rate_avg, hrv, stress_level 1-10, habits JSONB {meditation, journal, stretch}, location (FK to P6), weather JSONB {temp, humidity, uv_index, aqi}, notes, source (manual|fitbit|oura|gadgetbridge|sleep_android)`.
- **bio_goals** (extend) — `type (weight|sleep|exercise|nutrition|habit|hydration), target_value, current_value, unit, frequency, start_date, end_date, status, notes`.
- **vaccinations** (new, ties to P4) — `vaccine, dose_number, date_given, location, batch_number, expiry_date, certificate_url, notes`.
- **health_alerts** (new, scrapers) — `source (WHO|CDC|ECDC|ProMED|MAEC_Spain), country_iso, alert_level (info|watch|warning|critical), disease, title, description, url, published_at, fetched_at`.
- **health_documents** (new, medical vault) — `doc_type (blood_test|prescription|vaccination_cert|imaging|dental|other), date, country, provider, title, file_path encrypted, metadata JSONB, tags TEXT[]`.
- **water_autonomy** (new, van state) — `date, tank_level_l, last_refill, estimated_days`.

### 7. Cross-pillar mentions
- **P4 Bureaucracy**: vaccinations table → required-docs checklist per destination; Spanish Convenio Especial SNS (~€60/mo) tracking; insurance renewal (SafetyWing/OVHC/Genki); medical-records vault shareable on demand. **vaccinations** table ownership flagged as open question (P7 owns, P4 surfaces).
- **P6 Logistics/Travel**: current + planned destinations drive `health_alerts` matching; vaccination requirements pre-flight; water autonomy vs next water refill; UV/AQI pre-travel forecast; cheap-healthcare-by-country cross-referenced for "medical tourism" stops (dental in Turkey/Hungary, blood panel in Thailand/India).
- **"P2 Finance" (doc numbering)**: supplements/gym/insurance/medical costs categorized; medical tourism savings tracked.
- **"P3 Work/Projects" (doc numbering)**: developer burnout signals → flag work planning; HRV trend → recovery-based workload suggestions; physical work days adjust nutrition & fasting.
- Shares **Open-Meteo** with P6.

### 8. Cost
- **Free tier** possible for nearly everything (all self-hosted apps OSS).
- Wearable MVP: Mi Band 8 + Gadgetbridge ~$30 total.
- Insurance: SafetyWing $45-56/mo, World Nomads $100+/mo, Genki ~€67/mo (explicit recommended ~$45/mo minimum).
- Memberships (Supplements + blood tests abroad): budget ~$15-45 per blood panel in Thailand/India.

### 9. Events / triggers
- Daily 8:00 AM cron: fetch Fitbit/Oura → sleep/HR/steps; Open-Meteo + OpenUV + AirVisual → weather/UV/AQI; insert `bio_entries`; notification "Slept 6.5h. UV 8 (high). AQI 45 (good)".
- Meal logging: free text → CalorieNinjas parse → update `meals` JSONB → daily totals vs goals → deficit/excess notification.
- Weekly Sunday 20:00 review → summary → Telegram/email.
- Outbreak alerts: daily scrape WHO/CDC/ECDC/MAEC → `health_alerts` → join P6 destinations → push if match.
- Vaccination expiry weekly cron → query `vaccinations WHERE expiry_date < NOW() + 60 days` → cross-reference planned destinations → notification + add to P4 tasks.

---

## GLOBAL SECTIONS

### A. Tech stack mentioned across pillars

**Languages**: Node.js (primary backend), TypeScript (frontend + TS ports), Python (JobSpy sidecar, NLP, most OSS repos), Vanilla JS (dashboard), SQL (PostgreSQL).

**Frameworks / runtimes**:
- Backend: Express.js, FastAPI (mentioned via OSS), Django (via OSS).
- Frontend: Vanilla HTML/CSS/JS "Glassmorphism" dashboard (existing), React (P2 proposed), MapLibre GL JS / Leaflet (P6), PWA + Service Worker, Dexie.js (IndexedDB).

**Libraries** (Node):
- `node-cron` (scheduler, replaces n8n in Ultra Engine).
- `rss-parser` (RSS, replaces Miniflux).
- `cheerio` + `fetch`/`axios` (scraper, replaces Changedetection+Playwright where possible).
- `tesseract.js` + `pdf-parse` (OCR, replaces Paperless).
- `node-telegram-bot-api` (bot).
- `helmet.js` (security headers).
- `pg` Pool (direct PostgreSQL).
- `csv-parse`, `dayjs` (CSV bank profile parsing).
- `fuse.js` (fuzzy payee matching).

**Queue / orchestration**: **pg-boss** (Postgres-backed, no Redis) — P2 explicit. Everywhere else: plain `node-cron` + PostgreSQL.

**Databases**: **PostgreSQL 16 Alpine** (single canonical store) + **PostGIS** (P6 geospatial) + **pgRouting** (P6 routing inside DB).

**Message / notification**: Telegram Bot (primary), email, ntfy.sh (push, P4), webhooks (future).

**ML/NLP libs (mentioned mostly in P1)**:
- Dedup: `datasketch` (MinHash+LSH), Sentence-BERT, SemHash.
- NER: spaCy, Flair, Stanza, GLiNER.
- Topic: bart-large-mnli (zero-shot), BERTopic, Top2Vec, SetFit.
- Summarization: PEGASUS, BART (facebook/bart-large-cnn), T5/FLAN-T5, LED (Longformer), Llama3/Mistral/Qwen.
- Sentiment: VADER, TextBlob, twitter-roberta-base-sentiment, bert-multilingual-sentiment, ProsusAI/finbert, NewsFeel.
- Fake news: GNN-FakeNews, FakeNewsNet, AraBERT+XGBoost.
- Translation: Helsinki-NLP/OPUS-MT (1,000+ pairs), Meta NLLB (200+), mBART-50, GemmaX2-28, Qwen3-235B, OpenNMT.

**OCR stack**: Tesseract (73K★), Stirling-PDF (76K★), MarkItDown (93K★), MinerU (58K★), surya (19K★), paperless-ai (5.5K★), OCRmyPDF (33K★), llm_aided_ocr (2.9K★).

**Data/market/quant**: OpenBB, yfinance, ccxt (~41K★), QuantStats (~6.9K★), freqtrade, vectorbt, backtrader.

**Automation (outside Ultra Engine)**: n8n (182K★) — referenced in P4/P5/P6, Huginn (49K★), changedetection.io (20-31K★) — **shared resource across P1/P4/P5/P6**.

**Routing (P6)**: GraphHopper (Docker, van profile with Custom Model), VROOM (multi-stop), pgRouting (in-DB), OSRM/Valhalla/ORS (alternatives), osm2pgrouting, PMTiles, tileserver-gl, Traccar.

**Offline-first (P6)**: Dexie.js, Service Worker, leaflet.offline, PMTiles.

### B. Cross-pillar integration matrix

| From → To | Description |
|---|---|
| **P1 News → P2 Employment** | Layoff/hiring news (Layoffs.fyi, TrueUp, Crunchbase, Challenger Report) cross-ref `emp_listings.company`; badge "3 recent news about this company". |
| **P1 News → P3 Finance** | Economic/FX news (Finlight, CoinDesk Policy, DL News, Atlantic Council Crypto Tracker, CentralBanking.com) → dashboard badge "NZD dropped 2% vs USD this week". |
| **P1 News → P4 Bureaucracy** | Policy change alerts (BOE RSS, VisaGuide.News, USCIS News, AEAT novedades via changedetection.io) → flags relevant to user's visas/tax. |
| **P1 News → P5 Opportunities** | Grants/competitions feed (GrantWatch, ProFellow, FundsForNGOs, Arch Grants). |
| **P1 News → P6 Logistics** | Travel safety early warning (US State Dept, Smartraveller, GDACS, ICG, FEWS NET). |
| **P1 News → P7 Biocheck** | Outbreak/disease alerts (WHO DONS, CDC, ProMED, HealthMap). |
| **P2 Employment → P3 Finance** | Salary received vs expected; runway/projections update; "Savings rate would be X%" simulator; country tax multipliers NZ 0.70 / AU 0.72 / ES 0.65. |
| **P2 Employment → P4 Bureaucracy** | Visa-vs-employment compatibility check (NZ: no own biz; AU 462: 6-mo same employer); track 88-day AU farm work for extension; scan nóminas → Paperless → `bur_documents` for DASP. |
| **P2 Employment → P5 Opportunities** | When no good employment offers in a sector → suggest freelance projects. |
| **P2 Employment → P6 Logistics** | Different city/country → relocation cost estimate (NZ→AU ~$2-3k NZD; NZ→ES ~$5-8k NZD); "You already have a flight to Melbourne 15/05". |
| **P3 Finance → P2 Employment** | Cost-of-living differential influences country preference. |
| **P4 Bureaucracy → P3 Finance** | Document OCR → extract amount/date/provider → auto-create txn; bidirectional `transaction.document_id ↔ document.transaction_id`; insurance/visa cost → recurring pending txn. |
| **P4 Bureaucracy → P6 Logistics** | Visa validity windows; Schengen 90/180 counter; WHV→88-day→2nd WHV→DN picker; IMEI Turkey 120-day; ESC ≤30. |
| **P4 Bureaucracy → P7 Biocheck** | Insurance (SafetyWing/OVHC/Genki) renewal; medical records vault; Spanish Convenio Especial SNS; vaccinations certs storage. |
| **P5 Opportunities → P3 Finance** | Won freelance project → `fin_pending` ("React project $2,500 — 50% paid, 50% pending"). |
| **P5 Opportunities → P4 Bureaucracy** | Grant deadlines → `bur_reminder`; scholarship deadlines; DN visa implications. |
| **P6 Logistics → P3 Finance** | Logistics cost (flight, lodging) → pending txn; runway impact; travel budget vs "Trip Spain" goal; FX rates (fawazahmed0); Numbeo/Nomad List CoL → P3 budget allocator; country-specific currency rules (Argentina post-cepo, Tanzania TZS-only, Korea wolse). |
| **P6 Logistics → P4 Bureaucracy** | Pre-travel checklists (pasaporte 6+ mo, visa validity, apostilla, seguro); suggest ES vs DZ passport per route; auto-trigger country checklist (e.g., Argelia). |
| **P6 Logistics → P7 Biocheck** | Current+planned destinations drive `health_alerts` matching; vaccination requirements pre-flight; UV/AQI pre-travel forecast; cheap-healthcare-by-country for medical tourism stops; water autonomy vs next water refill. |
| **P7 Biocheck → P2 Employment** | HRV trend + burnout signals adjust work planning (recovery-based workload). |
| **P7 Biocheck → P3 Finance** | Supplements/gym/insurance/medical cost categorization; medical tourism savings tracking. |
| **P7 Biocheck → P6 Logistics** | Air-quality/UV ownership boundary flagged as open question. |

**Shared infrastructure**: `changedetection.io` used by P1/P4/P5/P6. `n8n` referenced by P4/P5. Paperless-ngx serves P4/P3/P7 (receipts → finance, docs → bureaucracy, medical records → health). Open-Meteo shared by P6/P7.

### C. Build order / phases

**Ultra Engine transition (global)** — already in "final deployment phase" on Hetzner, migrating from 8-service Frankenstein (n8n, Paperless-ngx, Miniflux, Changedetection.io, Playwright, Grafana, Homepage, Redis) to 2-container monolith (Ultra-Engine + PostgreSQL). Blocked once by port 80 conflict; resolved via idempotent `deploy.sh`.

**P1 News** — Priority 1 (immediate, no cost): Currents+Newsdata+Finlight APIs, GDELT DOC 2.0, RSS for 23 missing countries, Bluesky firehose. Priority 2 (short-term): MinHash+LSH dedup, changedetection.io deploy, zero-shot classification, BART/PEGASUS summarization, ACLED+USGS+WHO DONS. Priority 3 (medium): Crawl4AI, FinBERT sentiment, Reddit PRAW, Podcast Index, Kill the Newsletter.

**P2 Employment** — 6 phases over ~10 weeks:
- Phase 1 (Week 1-2): JobSpy sidecar, Adzuna/Reed/InfoJobs/TradeMe/Jooble, normalizer+dedup, scoring engine, schema migration (v1→v2 rename), API endpoints, frontend, Telegram alerts → target ~2,600+ jobs/day, 80+ countries.
- Phase 2 (Week 3-4): gov sources (NAV, Bundesagentur, Job Bank CA, UK Sponsor, LMIA, EURES, France Travail, USAJobs, hh.ru, JobTech SE, visa sponsorship cross-ref).
- Phase 3 (Week 5-6): Workday universal scraper, SmartRecruiters/Greenhouse/Lever/Ashby/Amazon/Teamtailor.
- Phase 4 (Week 7-8): sector scrapers (Maritime/Cruise, FIFO/Mining/Oil, Ports, ETTs, ag, ES/NZ sector).
- Phase 5 (Week 9-10): embassy DB, visa sponsorship imports, CoL, application Kanban (study Oscar6/app-tracker), Eventbrite, notifications, cross-pillar.
- Phase 6 (future): SBERT/MiniLM ML matching, salary estimation, company intelligence, proactive recommendations.

**P3 Finance** — 5 phases:
- Phase 1 (now): schema migration, CSV bank profiles (5 NZ banks), smart dedup, manual input, Wise API, Frankfurter rates, envelopes, burn/runway/NW, Telegram alerts, pre-loaded NZ rules.
- Phase 2: Akahu (NZ auto-sync), GoCardless (Spain+Revolut EU), CCXT+CoinGecko crypto, recurring detection, learn-from-behavior, savings goals, NW timeline, cross-pillar.
- Phase 3: AI categorization, runway scenarios, anomaly, subscription tracker, tax estimation, FI tracker, receipt OCR.
- Phase 4: Koinly, day counter, Modelo 721 prep, PAYE calculator.
- Phase 5: webhooks, Firefly III rules integration, Paperless-ngx OCR, scheduled reports.

**P4 Bureaucracy** — priority:
- P0 (critical): document expiry tracking + alerts, tax deadline reminders.
- P1: Paperless-ngx deploy + paperless-ai auto-classify.
- P2: passport-index visa DB, Schengen calculator.
- P3: crypto tax integration, changedetection.io gov sites, n8n orchestration.

**P5 Opportunities** — 2-week quick-wins plan → 3-month diversification:
- Week 1: Outlier/Scale AI apply, GLG register, Malt.es, Toptal, configure API fetcher (RemoteOK+Remotive+Himalayas+Jobicy), Algora+IssueHunt+Superteam Earn, Solana/Polygon/Chainlink ambassadors.
- Week 2: daily fetcher implementation, ts-jobspy LinkedIn/Indeed, matching score, Telegram, NLnet proposal draft (deadline 1 June), clist.by notifications, first Algora bounty eval.
- Month 1: quick wins + automation. Month 2: diversify (first OSS bounty, first hackathon, Immunefi). Month 3: passive income (MVP or course launched, blog started).

**P6 Logistics** — no explicit weekly roadmap; decisions: GraphHopper as routing engine, pgRouting for in-DB, offline-first via PMTiles, Kiwi Tequila `/nomad` for flights, TREK as frontend reference. **Hard deadline: 7 June 2026 NZ green warrant.**

**P7 Biocheck** — no explicit phases; migration pending for `bio_entries.meals INT → JSONB`. MVP wearable: Mi Band 8 + Gadgetbridge ($30).

### D. Open questions / TODOs across all docs

**P1 News**:
1. Exact DB DDL (missing source docs NEWS_PILLAR_DESIGN.md / WORLDMONITOR_INTEGRATION_PLAN.md).
2. Orchestration cron/queues/retry.
3. Scoring weights per source.
4. Raw_text vs summaries retention.
5. Unified rate-limit strategy across 5 APIs.
6. Dedup canonical language (translate to EN or multilingual embeddings).
7. ACLED researcher access process.
8. Failover between World Monitor, RSSHub, secondary APIs.
9. Definitive 23-missing-countries CSV.
10. Cross-pillar topic taxonomy.

**P2 Employment**:
1. JobSpy Node port vs Python sidecar.
2. Workday subdomain discovery (manual curation vs Google dorks).
3. Adzuna vs Jooble vs Careerjet priority / dedup overhead.
4. LinkedIn ROI given anti-bot + legal gray.
5. Chilean Computrabajo residential proxies or skip.
6. Salary normalization raw vs pre-compute net.
7. User-configurable scoring weights.
8. Canonical listing choice when job in N portals.
9. GECCO seasonal origen contracts scrapeable?
10. Spain CCAA datos.gob.es aggregated datasets?
11. Visa CSV pre-load vs on-demand.
12. Cost-of-living data ownership (P2 or P3?).
13. Multilingual descriptions: ingest-translate vs view-time.
14. **Remote vs presential split: P2 vs P5 contradiction between v1 and v2 design docs.**

**P3 Finance**:
1. Firefly III vs custom ledger.
2. Akahu Phase 2 timing.
3. GoCardless 90-day consent refresh UX.
4. Crypto snapshot frequency (4 h vs hourly for CT4).
5. Beckham Law 6-month window + P4 integration.
6. Multi-base currency (NZD→EUR on move).
7. CT4 bot integration surface (in `fin_transactions` or separate table).
8. Day counter native vs nomad183tracker integration.
9. Modelo 721 automation at €50K.
10. DZD corridor semi-automation (Remitly no public API).
11. Georgia "Small Business" minimum integration needed.
12. ETF tax traps (Irish UCITS 41% + 8-year deemed disposal).

**P4 Bureaucracy**:
1. Embassy of Algeria Canberra address conflict (V1 vs V2 — confirm +61 2 6286 7355).
2. Algerian military service 2026 status.
3. Military exemption age (27 or 30?).
4. CDI Argelia-Australia existence.
5. Portugal IFICI terms.
6. AU WHV ballot 2026-2027 exact dates.
7. CDI Argelia-NZ confirmed NOT to exist — double-taxation gap.

**P5 Opportunities**:
1. WHV NZ entity registration for grants.
2. Callaghan → MBIE migration legacy programs.
3. Canada SUV replacement 2026 pilot.
4. Alibaba eFounders Africa 2026/2027 cohort date.
5. Chevening with DZ citizenship without DZ residency.
6. Dual-passport parallel application conflicts.
7. e-Residency vs Spanish SL advantages.
8. Tax residency stacking NZ WHV → AU → EU.
9. Solidity learning ROI for Node dev → Immunefi.
10. Arabic MSA vs Gulf dialect for ambassador/content.
11. MSF French level required.
12. Ukrainian programs remote feasibility 2026.
13. CT4 SaaS legal/KYC.
14. Arabic tech content studio from van.
15. Which APIs to seed `opp_sources` first.

**P6 Logistics**:
1. Workaway/housesit scraping legality 2026.
2. Park4Night unofficial API breakage contingency.
3. Schengen clock for DZ passport edge cases.
4. IMEI registrations beyond Turkey.
5. Starlink regulatory compliance (China, Iran).
6. Japan DN visa $67K income threshold.
7. Bali DN visa IDR 15M break-even.
8. Van shipping NZ→AU→EU vs sell-rebuy.
9. Self-host routing vs cloud break-even volume.
10. Kiwi House Sitters vs TrustedHousesitters NZ openings.
11. ESC age cutoff check (user >30?).
12. ACSI CampingCard €15 worth.
13. Madeira free coworking openings 2026.
14. Zanzibar/Arugam Bay internet pre-stay speed-test.
15. Tanzania TZS-only law interaction with card payments.

**P7 Biocheck**:
1. **`bio_entries.meals INT → JSONB` migration preserving history.**
2. First wearable budget (proposed Mi Band 8 + Gadgetbridge).
3. `health_documents` encryption (per-file age vs LUKS volume).
4. Air-quality/UV scheduling owner (P7 or P6).
5. Spanish paper vaccination card import (OCR vs manual).
6. Algerian medical record strategy.
7. Outbreak alert de-dup across WHO/CDC/ECDC/ProMED.
8. GDPR/data residency (self-host Hetzner Germany).
9. fasten-onprem integration vs minimal custom table.
10. Spanish-insurance reimbursable therapy while nomading.
11. Prescription refills abroad (ADHD/chronic meds) cross-border legality.
12. Notification channels (Telegram real-time + email weekly).
13. Offline-first local SQLite cache → PostgreSQL sync.
14. Parkrun results auto-scrape.
15. **`vaccinations` table ownership: P7 or P4?**

**Missing source documents flagged**: NEWS_PILLAR_DESIGN.md, WORLDMONITOR_INTEGRATION_PLAN.md, PILLAR1_COMPLEMENTARY_REPOS.md, PILLAR1_COUNTRIES_AND_TOPICS_RESEARCH.md — none exist on filesystem as of consolidation date.

---

*Extraction complete. All paths in this document are absolute. No invented data — everything is sourced from the seven consolidated pillar docs plus the ARCHITECTURE.md / ULTRA_SYSTEM_AUDIT.md context files. Pillar docs total ~11,900 lines (P1 795, P2 1,819, P3 1,573, P4 2,240, P5 2,224, P6 1,716, P7 1,534).*