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

## General
- [TEMPLATE] | cualquier módulo | Marcar tarea como done sin tests
  FIX: tests en verde antes de actualizar PROGRESS.md
