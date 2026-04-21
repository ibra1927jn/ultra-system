# vida, control -- ULTRA System

Sistema de inteligencia personal para Ibrahim (dual ES/DZ citizen, digital nomad, WHV NZ).
7 pilares operativos + WorldMonitor (vista geopolítica/mercados/inteligencia global).

## Stack (estado real 2026-04-14)

- **Node.js 22** + Express 5.1 + **PostgreSQL 16-alpine** (275 tablas totales, 49 bajo uso activo)
- **Docker Compose** multi-service (17 contenedores corriendo):
  - `ultra_engine` (API + scheduler + Telegram bot, port 3000)
  - `ultra_db` (PostgreSQL)
  - `ultra_nlp` (FastAPI + transformers: classify/summarize/sentiment/embed/translate)
  - `ultra_spacy` (NER)
  - `ultra_extract` (trafilatura — article scraping)
  - `ultra_puppeteer` (profile-gated headless Chrome for SPAs)
  - `ultra_telethon` (Telegram OSINT channels)
  - `ultra_traccar` (GPS tracking, bound to 127.0.0.1)
  - `ultra_paperless` + `ultra_paperless_redis` (document OCR vault)
  - `ultra_changedetection` (gov site monitoring)
  - `ultra_fasten`, `ultra_wger`, `ultra_mealie`, `ultra_grocy` (health/meal sidecars)
  - `ultra_jobspy` (job aggregation sidecar)
  - `ultra_rss_bridge` (RSS conversion for non-standard feeds)
  - `ultra_osrm` (routing, profile-gated, 1.2GB pre-processed data)
- **Scheduler**: `node-cron` with **85 registered jobs** (every 5min–daily)
- **Frontend**: vanilla HTML/CSS/JS, glassmorphism, cacheable split
  (worldmap.html 26KB shell + worldmap.css 88KB + worldmap.js ~180KB + worldmap-utils.js)
- **Tests**: vitest. **305 tests** al 2026-04-21 — 153 backend (`ultra-engine/tests/`, 9 files) + 152 web (`ultra-engine/web/src/test/`, 30 files). Endpoint coverage sigue fino: solo `/api/admin/status`, `/api/auth/login`, `/api/home/overview`, `/api/jobs/search-local` tienen integration tests dedicados (el resto son unit/data tests).

## Commands

- `docker compose up -d` — start all services
- `docker compose logs -f ultra_engine` — view engine logs
- `docker exec ultra_engine npx vitest run` — run all tests
- `docker exec ultra_engine npx vitest run tests/wm-endpoints.test.js` — wm tests only
- `docker cp <local> ultra_engine:<container>` — deploy a file without rebuild
- `docker restart ultra_engine` — restart after backend changes
- `git push` — triggers deploy.yml on GitHub Actions
- `node scripts/rebuild_db.js` — idempotent DB migration
- `bash scripts/backup_db.sh` — PostgreSQL dump + 7-day rotation

## Architecture

### Backend (`ultra-engine/`)
- `server.js` — Express entry, middleware (helmet, rate-limit, cookie auth)
- `src/db.js` — pg pool
- `src/telegram.js` — Telegram bot
- `src/scheduler.js` — 85 cron jobs
- `src/middleware/jwt-auth.js` — JWT + cookie auth (dual mode)
- `src/routes/` — 13 route files:
  - `auth.js, webhooks.js, documents.js, status.js, feeds.js, jobs.js,`
  - `finances.js, opportunities.js, logistics.js, bio.js, bureaucracy.js,`
  - `agentbus.js` (X-API-Key auth, inter-agent messaging)
  - **`wm.js`** — 27-line thin aggregator; actual routes in `src/routes/wm/`:
    - `constants.js` — COUNTRY_ALIASES (85 countries), TOPIC_KEYWORDS (30 topics), regex builders
    - `news.js` — 9 endpoints: /summary, /news/*, /news/filtered, /news/pulse, /news/activity, /news/timeline
    - `map.js` — 18 endpoints: /map/* (flights, vessels, fires, quakes, events, outages, static layers, geojson)
    - `markets.js` — 3 endpoints: /markets/snapshot, /intelligence-brief, /markets/sparklines
    - `article.js` — 3 endpoints: /article/:id, /fulltext (scrape+summarize), /translate
    - `search.js` — 2 endpoints: /search (tsvector+ts_rank), /search/suggest
    - `compare.js` — /compare (side-by-side 2-4 countries)
    - `misc.js` — /geo-hierarchy
    - `url-safety.js` — SSRF guard (private IPs, metadata, internal hostnames)
    - `rate-limit.js` — per-user token bucket (scrape 10/min, search 30/min)
- **Total: 39 wm endpoints** under `/api/wm/*`

### Frontend (`ultra-engine/public/`)
- `index.html` — Mission Control dashboard (7 pillars overview)
- `login.html` — cookie auth login page
- `worldmap.html` — WorldMonitor shell (26KB)
- `worldmap.css` — all styles (~88KB)
- `worldmap.js` — main app logic (~180KB, single IIFE, 20 workspaces, cmdk, reader, compare, etc.)
- `worldmap-utils.js` — pure utils shared with Node tests (escHtml, isoToFlag, fmtPrice, fuzzyMatch, etc.)
- `money.html` / `money.css` / `money.js` — **Money Cockpit (P3 Finanzas)** — 14 paneles, 6 workspaces, ~3500 LOC total. Mirrors worldmap architecture: dedicated route `/money.html` requireAuth, single-IIFE JS, glassmorphism dark theme. Surfaces 18+ endpoints from `routes/finances.js` (runway, budget envelope, recurring, investments, crypto, NW timeline, tax cockpit ES+NZ, savings goals, CSV import, receipt OCR).

### Data (`ultra-engine/data/`)
Static JSON reference data committed to git:
- `geo-hierarchy.json` — continents/subregions/countries tree
- `map-{bases,cables,conflicts,economic,hotspots,nuclear,pipelines,ports,waterways}.json`
- `ne_110m_countries.geojson` (country polygons)

### DB (`db/init.sql`)
49 tables organized by pillar + 15+ WorldMonitor tables. Indexes for perf (88+ total).
GIN trigram index on rss_articles.title for fast regex/ILIKE.

## Project Rules

- **Code in English, comments in Spanish, commits in English**
- **Read ERRORES.md and PROGRESS.md before starting any task**
- **NO DONE without real data in DB** (no mocks in smoke/integration tests)
- **1 push per coherent block** — validate with `docker cp` ephemeral deploy before commit
- `.env` never committed (use `.env.example` as template)
- DB only accessible internally via `ultra_net` docker network
- Migrations: append to `init.sql` or run targeted ALTER in live DB (document in memory)
- Uploads persisted in Docker volume `engine_uploads`
- Telethon data in `telethon_data` volume
- Changedetection data in `changedetection_data` volume

## Production

- **Server**: Hetzner CX43 (8vCPU, 16GB RAM). Docker data migrated to sdb (80% usage).
- **URL**: `http://95.217.158.7` (port 80 → container 3000)
- **Auth**: login at `/login.html` with admin@ibrahim.ops (cookie JWT). API clients use `Authorization: Bearer <token>`.
- **Dashboard**: `/` (index.html with 7-pillar overview) + `/worldmap.html` (intelligence map)
- **Deploy**: push to `master` → GitHub Actions runs `.github/workflows/deploy.yml`
- **DB backup**: `scripts/backup_db.sh` cron'd daily

## Environment Variables (keys only)

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (user is `ultra_user`, db is `ultra_db`)
- `JWT_SECRET`, `API_KEY`, `WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `TZ` (Pacific/Auckland)
- `DB_HOST`, `DB_PORT`, `PORT`
- `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PASS`
- `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`
- `FRED_API_KEY`, `EIA_API_KEY`, `FINNHUB_KEY`, `FMP_KEY` (optional, for more market data)

## Key conventions

- **Workspaces**: 20 pre-defined personas (trader, journalist, analyst, retiree, traveler, etc.)
  persisted in localStorage. Each sets topics + layers + time range + choropleth mode + UI toggles.
- **Topic filtering**: multilingual regex over `primary_topic`/`secondary_topic`/`title`.
  Feed-level classifier is poor (63K articles as "general_world_news") — keyword matching overrides.
- **Country filtering**: feed-scope OR multilingual alias match in title/nlp_summary.
- **Bluesky exclusion**: when topic filter is active, bsky is excluded to reduce noise.
