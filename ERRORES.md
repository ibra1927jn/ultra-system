# ERRORES.md — Lo que no volvemos a hacer

## Formato
[Fecha] | [Archivo afectado] | [Error] | [Fix aplicado]

---

## TypeScript
- [2026-03-27] | global | Usar ny en tipos → errores en runtime silenciosos
  FIX: tipar siempre explícitamente, especialmente payloads de DB

## Seguridad
- [2026-03-28] | deploy_hetzner.js | Credenciales hardcodeadas (IP del VPS, password root) en deploy script | Migrado a process.env con dotenv. .env.example actualizado sin valores reales
- [2026-03-28] | server.js, routes/*.js | API sin autenticacion — cualquiera podia acceder a todos los endpoints | Agregado middleware apiKeyAuth con API_KEY via env var, comparacion timing-safe. /api/health queda publico para monitoreo
- [2026-03-28] | telegram.js | TELEGRAM_CHAT_ID no se validaba — sendAlert fallaba silenciosamente si no estaba configurado | Agregado warning explicito cuando CHAT_ID falta o es not_configured. Try-catch en inicializacion del bot

## Infraestructura
- [2026-03-28] | docker-compose.yml | Puerto 80 bloqueado por contenedores Docker legacy en Hetzner (n8n, Paperless, etc. de la infra vieja) | Creado scripts/fix_port80.sh para limpiar containers legacy y reiniciar ULTRA System
- [2026-03-28] | server.js | /api/health solo devolvía {ok, time} — insuficiente para diagnosticar problemas en producción | Ampliado: ahora reporta estado DB, Telegram, 7 pilares, uptime, tamaño DB, version Node

## Arquitectura
- [2026-03-28] | rss.js | fetchFeed retornaba solo un numero (newCount), impidiendo que el scheduler supiera si habia articulos relevantes para alertar | Refactorizado para retornar { newCount, highScoreArticles }. Feeds route actualizada para manejar el nuevo retorno
- [2026-03-28] | scheduler.js | Los jobs de budget, pipeline, logistica y bio no existian — el scheduler solo tenia 5 jobs basicos | Agregados 4 nuevos cron jobs: budget-alerts (09:00), opportunity-reminders (09:05), logistics-next48h (08:00), bio-weekly-summary (dom 20:00)

## General
- [TEMPLATE] | cualquier modulo | Marcar tarea como done sin tests
  FIX: tests en verde antes de actualizar PROGRESS.md
- [2026-03-29] | server.js:57 | Agent Bus (/api/agent-bus) montado SIN apiKeyAuth — endpoints /send, /git-push, /complete abiertos al publico | Añadido apiKeyAuth al mount del router
- [2026-03-29] | src/middleware/auth.js:18 | isDashboard=true cuando !referer — curl sin Referer bypasseaba auth en GET | Cambiado a verificacion estricta: referer debe empezar con http(s)://host
- [2026-03-29] | src/middleware/auth.js:20 | Dashboard solo exento en GET, pero frontend hace POST/PATCH sin API key — calls fallaban con 401 | Dashboard ahora exento para todos los metodos (verificado por origen estricto)
- [2026-03-29] | src/middleware/auth.js:25 | API key aceptada via query string (req.query.api_key) — se filtra en logs y browser history | Eliminado, solo se acepta via header X-API-Key
