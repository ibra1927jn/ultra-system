---
# PROGRESS.md — vida, control

## Estado actual
[El proyecto principal está en fase de despliegue local o migración. Las funciones core están estables pero faltan integraciones finales.]

## Completado ✅
- Estructura base completada.
- Archivos iniciales configurados.
- [2026-03-28] | Limpieza credenciales: deploy_hetzner.js migrado a env vars, .env.example sin valores reales
- [2026-03-28] | API auth: middleware apiKeyAuth agregado a todos los endpoints /api/* (excepto /api/health). API_KEY en .env, docker-compose.yml y .env.example
- [2026-03-28] | Telegram bot: validacion de CHAT_ID + try-catch en init. Bot lee correctamente de env vars
- [2026-03-28] | Docker compose: API_KEY agregada al environment del engine. Env vars de DB verificadas (match con db.js)
- [2026-03-28] | Deploy script: verificado — usa dotenv, lee de env vars, soporta SSH key + password fallback
- [2026-03-28] | P3 Finanzas: tabla finances + rutas GET/POST /api/finances + GET /api/finances/summary + comando /finanzas
- [2026-03-28] | P5 Oportunidades: tabla opportunities + rutas GET/POST/PATCH /api/opportunities + comando /oportunidades
- [2026-03-28] | P6 Logistica: tabla logistics + rutas GET/POST/PATCH /api/logistics + GET /api/logistics/upcoming + comando /logistica
- [2026-03-28] | P7 Bio-Check: tabla bio_checks + rutas GET/POST /api/bio + GET /api/bio/trends + comando /bio
- [2026-03-28] | 7/7 pilares implementados, ULTRA System completo
- [2026-03-28] | Agent bus /send endpoint for inter-agent messaging | Commit 7512357
- [2026-03-28] | Dashboard: 4 new pilars (Finanzas, Oportunidades, Logística, Bio-Check) | Commit 052490a
- [2026-03-28] | Fix JSON parsing all 7 pilars for Mission Control | Commit 4ed12a4
- [2026-03-28] | Adzuna API integration — 95 job listings imported (6 categories) | Commit efdd21d
- [2026-03-28] | Enhanced Employment panel: tabs, search, save/applied/skip, clickable | Commit f6b5f0c
- [2026-03-28] | Fix syntax error line 754 + tab event handling | Commit 8ef95db

## Completado (Heartbeat 2026-03-29) ✅
- [2026-03-29] | Security: .gitignore hardened — added .env.*.local, .DS_Store, editor swap files, IDE dirs, coverage/
- [2026-03-29] | Testing: vitest framework added (21 tests). Auth middleware (10), DB module (2), RSS scoring (10). All passing
- [2026-03-29] | Audit: SQL injection scan clean (all parameterized queries), async error handling verified (all routes have try/catch)
- [2026-03-29] | Fix: scheduler.js — healthPing() and scrapeFreelanceOpportunities() were malformed (nested functions, health check ran inside scraper scope)
- [2026-03-29] | Refactor: removed dead `path` import from documents route, hoisted crypto require in auth middleware
- [2026-03-29] | Testing: 7 new tests for freelance project scoring algorithm (28 total, all passing)
- [2026-03-29] | Refactor: removed unused FREELANCER_FEEDS constant from freelance_scraper.js (dead code)
- [2026-03-29] | Refactor: hoisted db require to module level in routes/jobs.js (was inside PATCH handler)
- [2026-03-29] | Testing: 7 scraper hashContent tests + 8 OCR saveFile/listFiles tests (43 total, all passing)
- [2026-03-29] | Fix: auth.js — crypto require was after function that uses it, hoisted to module level
- [2026-03-29] | Fix: scheduler.js — scrapeJobSources empty catch replaced with console.warn for debuggability
- [2026-03-29] | Refactor: pearson correlation consolidated from 3 duplicates (bio.js, scheduler.js, telegram.js) into utils/pearson.js
- [2026-03-29] | Testing: 10 pearson correlation tests + 8 formatDocumentAlert tests (61 total, all passing)
- [2026-03-29] | Fix: finances.js — redundant parseFloat(amount) called 3 times, now parsed once into variable
- [2026-03-29] | Fix: scheduler.js bar() — progress bar rendered wrong length for negative/out-of-range values (clamping bug)
- [2026-03-29] | Fix: scraper.js — Adzuna error log referenced search.what (undefined) instead of search.what_or
- [2026-03-29] | Refactor: bio.js — removed stale "Pearson" section comment left after extraction to utils/
- [2026-03-29] | Testing: 25 new tests — bar renderer (9), logistics mapping (3), bio validation (13) + 20 new tests — finances validation (10), logistics validation (10). 106 total, all passing
- [2026-03-29] | Fix: ocr.js — replaced console.log('') with process.stdout.write('\n') to avoid polluting log streams
- [2026-03-29] | Refactor: scraper.js — exported hashContent so tests import the real function instead of duplicating it
- [2026-03-29] | Testing: 28 new tests — opportunity status/pipeline rates (14), document validation (8), budget runway/RSS weight (6). 134 total, all passing
- [2026-03-29] | Infra: added @vitest/coverage-v8 for test coverage reporting
- [2026-03-29] | Refactor: removed unused `path` import from agentbus.js (dead code)
- [2026-03-29] | Fix: server.js — replaced console.log('') with process.stdout.write('\n') in startup banner (consistent with ocr.js fix)
- [2026-03-29] | Testing: 54 new tests — pipeline conversion rates (9), runway/burn calculations (9), bio correlation interpretation (12), agentbus commit parsing/routing/validation (24). 188 total, all passing
- [2026-03-29] | Security: removed realistic-looking API key placeholder from .env.example (replaced with empty value)
- [2026-03-29] | Testing: 53 new tests — db helpers/query patterns (15), scraper hash edge cases (9), auth dashboard detection + timing-safe comparison (10), telegram urgency thresholds + emoji mapping (11), RSS keyword clamping + threshold logic (12). Total: 246 tests, all passing. Coverage: 12% → improved via pure-logic extraction tests
- [2026-03-29] | Fix: telegram.js — bar() in /bio handler missing Math.min/Math.max clamping (would crash on out-of-range values)
- [2026-03-29] | Fix: status.js — 5 swallowed .catch() handlers now log errors via console.warn before returning defaults
- [2026-03-29] | Testing: 25 new tests — jobs status/source/search validation (15), feeds url/name + keyword validation (10). Total: 271 tests, all passing
- [2026-03-29] | Refactor: extracted duplicate bio weekly SQL query (3 copies in scheduler.js + telegram.js) into shared utils/bio_queries.js

## En progreso 🔄
- Implementacion de CI/CD local en AgenticOS (Ollama + Claude Code).
- Limpieza de contexto.

## Completado (Heartbeat 2026-03-30) ✅
- [2026-03-30] | Refactor: extracted 5 scheduler message formatters (budget, opportunity, logistics, bio summary, bar) into shared utils/scheduler_format.js
- [2026-03-30] | Refactor: extracted bio alert generation logic from routes/bio.js into utils/bio_alerts.js for testability and reuse
- [2026-03-30] | Refactor: exported TYPE_EMOJI and urgencyEmojiDoc from telegram.js for direct testing
- [2026-03-30] | Testing: 75 new tests — bio alerts (13), scheduler formatters (30), telegram exports (11), freelance scraper (7), RSS keyword clamping (10), OCR sanitization (8). Total: 346 tests, all passing
- [2026-03-30] | Coverage: 13% → 23% statement coverage (utils/ at 90-100%, middleware at 100%)
- [2026-03-30] | Fix: eslint config missing Node.js 18+ globals (fetch, AbortSignal, URLSearchParams) — false-positive no-undef errors
- [2026-03-30] | Refactor: demoted 5 per-file debug traces in ocr.js and 1 in scraper.js from console.log to console.debug (reduces prod log noise)
- [2026-03-30] | Refactor: extracted pure keyword scoring from rss.js into utils/rss_scoring.js (DB-free, testable)
- [2026-03-30] | Testing: 14 new tests for rss scoring (null inputs, case-insensitivity, multi-keyword accumulation, edge cases). Total: 360 tests, all passing
- [2026-03-30] | Coverage: 23% → 24% statement coverage (rss_scoring.js at 100%)
- [2026-03-30] | Refactor: removed 44 lines of duplicate TYPE_EMOJI/urgencyEmojiDoc/formatDocumentAlert from telegram.js — now imports from utils/document_format.js
- [2026-03-30] | Refactor: removed unnecessary scoreProject re-export from freelance_scraper.js, test imports directly from utils/freelance_scoring.js
- [2026-03-30] | Refactor: extracted duplicate salary formatting (2 copies in scraper.js) into utils/salary_format.js
- [2026-03-30] | Refactor: extracted duplicate budget/runway calculation (scheduler.js + routes/finances.js) into utils/budget_calc.js
- [2026-03-30] | Testing: 16 new tests — salary_format (7), budget_calc (9). Total: 413 tests, all passing. Coverage: 28% → 30%
- [2026-03-30] | Refactor: demoted 19 per-execution console.log to console.debug across scheduler.js (12), rss.js (2), freelance_scraper.js (1), scraper.js (4) — reduces prod log noise
- [2026-03-30] | Refactor: extracted duplicate budget alerts SQL (3 copies in scheduler.js, finances.js, telegram.js) into shared BUDGET_ALERTS_SQL in utils/budget_calc.js
- [2026-03-30] | Refactor: extracted duplicate typeEmoji (3 copies in telegram.js, scheduler_format.js) into shared LOGISTICS_TYPE_EMOJI constant; removed duplicate bar() redefinition in telegram.js
- [2026-03-30] | Testing: 16 new edge-case tests — salary_format (3), pearson (3), budget_calc BUDGET_ALERTS_SQL (4), scheduler_format boundaries/empty arrays (6). Total: 437 tests, all passing
- [2026-03-30] | Refactor: extracted commit parsing logic (parseCommitAction, identifyCommitSource) from routes/agentbus.js into utils/commit_parse.js
- [2026-03-30] | Refactor: extracted Adzuna API param builder (buildAdzunaUrl, normalizeAdzunaJob) from scraper.js into utils/adzuna_params.js — deduplicated fetchAdzuna/searchAdzuna
- [2026-03-30] | Testing: 47 new tests — commit_parse (18), adzuna_params (29). Total: 484 tests, all passing. Coverage: 25% → 29%

## Completado (Smart Upgrades) ✅
- [2026-03-28] | P1 Smart RSS: keyword scoring (tabla rss_keywords + columna relevance_score en rss_articles). CRUD keywords en /api/feeds/keywords. Fetch con scoring y alerta Telegram si score >= 8. Comando /noticias_config
- [2026-03-28] | P3 Budget & Runway: tabla budgets. GET /api/finances/budget (burn rate, runway, gastos por categoria vs limite). POST /api/finances/budget (set limite). GET /api/finances/alerts (categorias >80%). Comando /presupuesto
- [2026-03-28] | P5 Pipeline & Reminders: GET /api/opportunities/pipeline (conteo por status, conversion rates, follow-ups, deadlines). Scheduler: deadline reminders (3 dias) + follow-up alerts (contacted >7 dias). Comandos /pipeline
- [2026-03-28] | P6 Smart Alerts: GET /api/logistics/next48h (urgencia critical/urgent/upcoming). GET /api/logistics/costs (gastos por ubicacion/tipo). Columna cost en logistics. Scheduler: alerta diaria 48h. Comando /proximas
- [2026-03-28] | P7 Correlations & Alerts: GET /api/bio/correlations (Pearson: sleep/energy, sleep/mood, exercise/energy). GET /api/bio/alerts (sleep <6h, energy <4 ultimos 3 dias). Scheduler: resumen semanal dom 20:00. Comando /biosemana
- [2026-03-28] | Scheduler: de 5 a 9 cron jobs. Nuevos: budget-alerts (09:00), opportunity-reminders (09:05), logistics-next48h (08:00), bio-weekly-summary (dom 20:00)
- [2026-03-28] | DB: 2 nuevas tablas (rss_keywords, budgets) + 2 columnas (rss_articles.relevance_score, logistics.cost) + 4 indices nuevos
- [2026-03-28] | Telegram: 5 nuevos comandos (/noticias_config, /presupuesto, /pipeline, /proximas, /biosemana). Help actualizado

## Completado (infra) ✅
- [2026-03-28] | scripts/fix_port80.sh: script para limpiar contenedores legacy que bloquean puerto 80 en Hetzner
- [2026-03-28] | /api/health mejorado: reporta DB (estado, tamaño, tablas), Telegram (activo/inactivo), 7 pilares cargados, uptime, node version
- [2026-03-28] | scripts/backup.sh mejorado: compatible con prod (/backups) y local, PATH explícito para cron
- [2026-03-28] | docker-compose.prod.yml: restart always, health checks, límites memoria (512MB engine, 256MB db), volumen backup, logging controlado

## Completado (Production Readiness) ✅
- [2026-03-28] | API_KEY: placeholder generado en .env.example con instrucciones para cambiar en produccion
- [2026-03-28] | scripts/rebuild_db.js: migracion idempotente de todas las tablas (15 tablas, 22+ indices). Seguro sobre datos existentes
- [2026-03-28] | scripts/backup_db.sh: dump PostgreSQL + gzip + rotacion 7 dias. Compatible local/prod
- [2026-03-28] | scripts/setup_production.sh: checklist completo (env vars, DB, Telegram, migracion, cron backup, reporte final)

## Pendiente ⏳
- Ejecución completa con agentes de IA autónomos.
- Actualización de paquetes.
- Agregar API_KEY real al .env de produccion (generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
- Ejecutar setup_production.sh en Hetzner: bash scripts/setup_production.sh
- Crear directorio /backups en Hetzner antes de usar docker-compose.prod.yml: mkdir -p /backups

## Bloqueado 🚫

---
