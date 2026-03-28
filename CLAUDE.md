# vida, control — Sistema de inteligencia personal (ULTRA System)

## Stack
Node.js 22 + Express 5.1 + PostgreSQL 16
Docker Compose (2 servicios: ultra_engine + ultra_db)
Tesseract.js (OCR) + pdf-parse + cheerio (scraping) + rss-parser
node-telegram-bot-api + node-cron
Frontend: HTML/CSS/JS vanilla (dashboard glassmorphism)

## Comandos
- `docker compose build --no-cache` — Build imagen
- `docker compose up -d` — Levantar servicios
- `docker compose logs -f ultra_engine` — Ver logs
- `node --watch server.js` — Dev mode (dentro de ultra-engine/)
- `node deploy_hetzner.js` — Deploy a Hetzner via SFTP + SSH
- `bash scripts/backup.sh` — Backup DB + uploads + config

## URL produccion
http://95.217.158.7 (puerto 80, cuando no esta bloqueado)

## Estructura clave
- ultra-engine/server.js — Entry point Express
- ultra-engine/src/
  - db.js — Pool PostgreSQL (pg)
  - telegram.js — Bot Telegram con comandos
  - scheduler.js — 5 cron jobs
  - ocr.js — Tesseract + pdf-parse
  - rss.js — Parser RSS
  - scraper.js — Cheerio web scraper
  - routes/ — documents, status, feeds, jobs, finances, opportunities, logistics, bio (30+ endpoints)
- ultra-engine/public/ — Dashboard HTML/CSS/JS
- db/init.sql — Schema (13 tablas, 18 indices)
- scripts/deploy.sh — Script de deploy en VPS
- scripts/backup.sh — Backup automatizado (retention 7 dias)
- docker-compose.yml — Orquestacion

## Pilares del sistema
- P1 Noticias: RSS reader (activo)
- P2 Empleo: Web scraper (activo)
- P3 Finanzas: CRUD ingresos/gastos + resumen mensual (activo)
- P4 Burocracia: Document alerts + OCR (activo)
- P5 Oportunidades: CRUD freelance/ideas + tracking status (activo)
- P6 Logistica: Transporte/alojamiento/visa/citas en NZ (activo)
- P7 Bio-Check: Sueno/energia/animo/ejercicio + tendencias (activo)

## Reglas del proyecto
- Zero servicios externos: todo el codigo es propio
- DB solo accesible internamente via Docker network (ultra_net)
- API protegida con API_KEY middleware
- .env nunca se commitea (hay .env.example)
- Migraciones: solo agregar al final de init.sql o crear migration files
- Uploads persistidos en Docker volume engine_uploads
- Backup cron recomendado: 0 3 * * *

## Variables de entorno (solo keys)
- POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
- API_KEY
- TZ (Pacific/Auckland)
- DB_HOST, DB_PORT, PORT

## Bug conocido
- Puerto 80 ocupado por Docker legacy en Hetzner
- Solucion pendiente: matar containers legacy, docker compose up
