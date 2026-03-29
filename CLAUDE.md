# vida, control -- ULTRA System

Sistema de inteligencia personal para Allan en NZ. 7 pilares: noticias, empleo, finanzas, burocracia, oportunidades, logistica, bio-check. Zero servicios externos (todo codigo propio).

## Stack
- Node.js 22 + Express 5.1 + PostgreSQL 16-alpine
- Docker Compose (2 servicios: ultra_engine + ultra_db)
- Tesseract.js (OCR) + pdf-parse + cheerio (scraping) + rss-parser
- node-telegram-bot-api + node-cron (9 cron jobs)
- Frontend: HTML/CSS/JS vanilla (dashboard glassmorphism)

## Commands
- `docker compose build --no-cache` -- build image
- `docker compose up -d` -- start services
- `docker compose logs -f ultra_engine` -- view logs
- `node --watch server.js` -- dev mode (inside ultra-engine/)
- `node deploy_hetzner.js` -- deploy to Hetzner via SFTP + SSH
- `node scripts/rebuild_db.js` -- idempotent DB migration (15 tables, 22+ indexes)
- `bash scripts/backup_db.sh` -- PostgreSQL dump + gzip + 7-day rotation
- `bash scripts/setup_production.sh` -- full production checklist

## Architecture
- `ultra-engine/server.js` -- Express entry point (port 3000)
- `ultra-engine/src/db.js` -- PostgreSQL pool (pg)
- `ultra-engine/src/telegram.js` -- Telegram bot with commands
- `ultra-engine/src/scheduler.js` -- 9 cron jobs
- `ultra-engine/src/ocr.js` -- Tesseract + pdf-parse
- `ultra-engine/src/rss.js` -- RSS parser with keyword scoring
- `ultra-engine/src/scraper.js` -- Cheerio web scraper
- `ultra-engine/src/freelance_scraper.js` -- Adzuna job scraper
- `ultra-engine/src/routes/` -- 9 route files (documents, status, feeds, jobs, finances, opportunities, logistics, bio, agentbus)
- `ultra-engine/src/middleware/auth.js` -- API key auth middleware
- `ultra-engine/public/` -- Dashboard HTML/CSS/JS
- `db/init.sql` -- Schema (13+ tables, 18+ indexes)
- `docker-compose.yml` -- orchestration (dev)
- `docker-compose.prod.yml` -- production (memory limits, logging)

## Project Rules
- Code in English, comments in Spanish, commits in English
- Read ERRORES.md and PROGRESS.md before starting any task
- DB only accessible internally via Docker network (ultra_net)
- API protected with API_KEY middleware (header X-API-Key only)
- .env never committed (use .env.example as template)
- Migrations: append to init.sql or use scripts/rebuild_db.js
- Uploads persisted in Docker volume engine_uploads

## Environment Variables (keys only)
- POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
- API_KEY
- TZ (Pacific/Auckland)
- DB_HOST, DB_PORT, PORT
- DEPLOY_HOST, DEPLOY_PORT, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_PASS
- ADZUNA_APP_ID, ADZUNA_APP_KEY

## Production
- Server: Hetzner CX23 (2vCPU, 4GB RAM, 40GB)
- URL: http://95.217.158.7 (port 80 -> 3000)
- Deploy: `node deploy_hetzner.js` (SFTP + SSH restart)
- CI/CD: GitHub Actions workflow (.github/workflows/deploy.yml)
