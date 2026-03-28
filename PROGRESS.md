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

## En progreso 🔄
- Implementacion de CI/CD local en AgenticOS (Ollama + Claude Code).
- Limpieza de contexto.

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
