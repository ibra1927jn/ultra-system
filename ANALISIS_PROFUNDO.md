# Análisis Profundo — vida, control (ULTRA SYSTEM)
**Fecha:** 2026-03-27

---

## 1. Módulos/Sistemas Completamente Implementados

### Arquitectura General (docker-compose.yml)
- Sistema dockerizado con SOLO 2 contenedores:
  - **ultra_db** — PostgreSQL 16 Alpine
  - **ultra_engine** — Node.js Express (todo el código propio)
- Reemplaza 8 herramientas de terceros: n8n, Paperless-ngx, Miniflux, Changedetection, Playwright, Grafana, Homepage, Redis
- Red interna Docker bridge (ultra_net)
- Volúmenes persistentes: postgres_data, engine_uploads
- Healthcheck de PostgreSQL configurado
- Target: Hetzner CX23 (2vCPU, 4GB RAM, 40GB)

### Ultra Engine — Servidor Principal (ultra-engine/server.js)
- Express 5.1.0 con middleware estándar (JSON, URL-encoded)
- API Routes:
  - `/api/documents` — Gestión documental
  - `/api/status` — Estado del sistema
  - `/api/feeds` — RSS/Noticias
  - `/api/jobs` — Ofertas de empleo
  - `/api/health` — Health check
- SPA fallback para dashboard
- Secuencia de arranque: verificar DB → iniciar Telegram bot → iniciar scheduler → iniciar servidor HTTP

### Base de Datos (db/init.sql)
- Schema completo con 8 tablas:
  - **document_alerts** — Alertas de caducidad de documentos (pasaporte, visa, etc.)
  - **user_status** — Estado del usuario (key/value con categorías)
  - **notification_log** — Log de notificaciones enviadas
  - **uploaded_files** — Archivos subidos con OCR text y confidence
  - **rss_feeds** — Fuentes RSS configuradas
  - **rss_articles** — Artículos parseados de RSS
  - **job_sources** — Fuentes de empleo a vigilar (URL + CSS selector)
  - **job_listings** — Ofertas de empleo encontradas
  - **scheduler_log** — Log de ejecución de cron jobs
- Índices optimizados en: expiry_date, is_active, key, category, feed_id, published_at, source_id, found_at, job_name, executed_at
- Foreign keys con ON DELETE CASCADE/SET NULL

### Scheduler / Cron (ultra-engine/src/scheduler.js)
- Reemplaza completamente a n8n
- 5 cron jobs registrados:
  1. **document-expiry-check** — Lunes 09:00, chequea documentos por caducar
  2. **urgent-document-check** — Diario 08:00, alerta urgente (<7 días)
  3. **rss-fetch** — Cada 30 min, busca nuevas noticias
  4. **job-scrape** — Cada 6 horas, scrape de ofertas de empleo
  5. **health-ping** — Cada hora, verifica DB
- Cada job registra duración y status en scheduler_log
- Error handling con try/catch y logging
- Timezone configurable via TZ env var

### Pilar 4: Burocracia — Alertas de Documentos
- **ACTIVO y funcional**
- Chequeo semanal: busca documentos con expiry_date dentro de alert_days
- Alerta urgente diaria: documentos a menos de 7 días de caducar
- Envía alertas formateadas por Telegram
- Log de cada notificación en notification_log

### Pilar 1: Noticias — RSS Reader (ultra-engine/src/rss.js)
- **ACTIVO** — Reemplaza Miniflux
- fetchAll() lee todas las fuentes RSS activas
- Parsea con rss-parser
- Guarda artículos nuevos en rss_articles (dedup por URL)
- Integrado en scheduler cada 30 minutos

### Pilar 2: Empleo — Web Scraper (ultra-engine/src/scraper.js)
- **ACTIVO** — Reemplaza Changedetection.io
- Scraping con Cheerio (HTML parser)
- CSS selectors configurables por fuente
- Detección de cambios via content hashing
- Dedup de ofertas por URL
- Notificación Telegram cuando hay ofertas nuevas
- Limita a 50 ofertas por scrape

### Pilar 4: OCR (ultra-engine/src/ocr.js)
- **ACTIVO** — Reemplaza Paperless-ngx
- OCR con Tesseract.js (ESP + ENG bilingüe)
- Soporte de PDF (pdf-parse)
- Upload de archivos con Multer
- Guarda texto OCR y confidence en uploaded_files

### Bot de Telegram (ultra-engine/src/telegram.js)
- **ACTIVO** — Reemplaza n8n para comunicación
- node-telegram-bot-api
- Envía alertas formateadas (documentos, noticias, empleo)
- Configurable via TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID

### API REST Completa (ultra-engine/src/routes/)
- **documents.js** — CRUD de alertas de documentos + upload con OCR
- **feeds.js** — CRUD de feeds RSS + fetch manual
- **jobs.js** — CRUD de fuentes de empleo + scrape manual
- **status.js** — Estado del sistema, scheduler, stats

### Dashboard Web (ultra-engine/public/)
- **index.html** — Dashboard HTML single page
- **css/style.css** — Dark theme premium
- **js/app.js** — JavaScript del dashboard (fetch API, render datos)

### Base de Datos Helper (ultra-engine/src/db.js)
- Pool de conexiones PostgreSQL (pg)
- Helper functions: query, queryOne, queryAll, healthCheck

### Deploy
- **scripts/deploy.sh** — Script de deploy al VPS
- **scripts/backup.sh** — Script de backup
- **Dockerfile** — Para el ultra-engine
- **deploy.tar.gz** (28MB) — Paquete de deploy pre-construido
- **deploy_hetzner.js** — Deploy programático con Node.js

### Documentación
- **README.md** — Documentación completa con stack, pilares, quick start, estructura
- **docs/ARCHITECTURE.md** — Documentación de arquitectura
- **docs/ULTRA_SYSTEM_AUDIT.md** — Auditoría del sistema
- **project_audit_valuation.md** — Valoración del proyecto

---

## 2. Módulos a Medias o Estructura Vacía

### Pilar 3: Finanzas (⏳ Pendiente)
- Status: "Pendiente" según README
- No hay código implementado para:
  - Control automático de Wise
  - Cálculo de runway
  - Tracking de gastos/ingresos
- La tabla de DB no existe aún

### Pilar 5: Oportunidades Freelance (⏳ Pendiente)
- Status: "Pendiente" según README
- No hay scraper de plataformas freelance (Upwork, Freelancer, etc.)
- No hay filtrado ni scoring de oportunidades

### Pilar 6: Logística (⏳ Pendiente)
- Status: "Pendiente" según README
- No hay integración con APIs de gasolina, clima, o rutas
- No hay dashboard de logística

### Pilar 7: Bio-Check (⏳ Pendiente)
- Status: "Pendiente" según README
- No hay tracking de energía, hábitos, o progreso personal
- No hay dashboard de bio-métricas

### Dashboard Web
- El dashboard existe pero es básico — HTML/CSS/JS vanilla
- No hay autenticación del dashboard (cualquiera con la IP puede acceder)
- No hay gráficos ni visualizaciones avanzadas

### RSS Feed Management
- Las fuentes RSS se configuran directamente en DB
- No hay UI para añadir/editar/eliminar feeds desde el dashboard

---

## 3. Problemas Técnicos a Primera Vista

### Sin autenticación del dashboard
- El dashboard web está expuesto en puerto 80 sin auth
- Cualquiera con la IP del VPS puede ver datos personales, documentos, etc.
- **Riesgo de privacidad ALTO**

### deploy.tar.gz en el repo
- 28MB de archivo comprimido en el repo Git — infla innecesariamente el historial
- Debería estar en .gitignore o en un sistema de releases

### Content hash débil (scraper.js)
- `hashContent()` usa un hash simple basado en charCodeAt — colisiones probables
- Debería usar crypto.createHash('sha256')

### Sin validación de input en API
- Las rutas API no validan payloads (no hay Joi, Zod, o similar)
- Vulnerable a inyección de datos malformados

### Express 5.1.0
- Express 5 es relativamente nuevo — podría tener breaking changes respecto a tutoriales/middleware legacy

### Sin HTTPS
- Docker expone puerto 80 directo — sin SSL/TLS
- El tráfico (incluyendo tokens de Telegram) viaja en texto plano
- Necesita Nginx + Certbot delante

### Fetch sin retry en scraper
- `fetch()` en checkSource tiene timeout de 15s pero sin reintentos
- Si una fuente falla temporalmente, se pierde el scrape

### Sin rate limiting API
- Las rutas API no tienen rate limiting — vulnerable a abuse

### Secrets en .env
- .env y .env.example existen pero .env está en el repo (aunque .gitignore debería protegerlo)
- Las variables incluyen POSTGRES_PASSWORD y TELEGRAM_BOT_TOKEN

---

## 4. Librerías y Herramientas Exactas

### Backend (ultra-engine/package.json)
- **express ^5.1.0** — Web framework
- **pg ^8.13.0** — PostgreSQL client
- **node-cron ^3.0.3** — Cron scheduler (reemplaza n8n)
- **node-telegram-bot-api ^0.66.0** — Bot de Telegram
- **tesseract.js ^5.1.1** — OCR engine (ESP + ENG)
- **rss-parser ^3.13.0** — Parser de RSS feeds
- **cheerio ^1.0.0** — HTML scraper/parser
- **multer ^1.4.5-lts.1** — File upload middleware
- **dotenv ^16.4.0** — Variables de entorno
- **pdf-parse ^1.1.1** — Parser de PDFs para OCR

### Base de Datos
- **PostgreSQL 16 Alpine** — via Docker

### Infraestructura
- **Docker / Docker Compose** — Contenerización
- **Hetzner CX23** — VPS (2vCPU, 4GB RAM, 40GB)

### Root package.json
- **ssh2 ^1.17.0** — Para scripts de deploy
- **ssh2-sftp-client ^12.1.0** — SFTP upload

---

## 5. Ficheros Más Importantes

| Fichero | Descripción |
|---------|-------------|
| `docker-compose.yml` | Arquitectura completa — 2 servicios: db + engine |
| `ultra-engine/server.js` | Punto de entrada — Express + Telegram + Scheduler |
| `ultra-engine/src/scheduler.js` | 5 cron jobs — corazón de la automatización |
| `ultra-engine/src/scraper.js` | Web scraper de empleo con Cheerio |
| `ultra-engine/src/rss.js` | RSS reader (reemplaza Miniflux) |
| `ultra-engine/src/ocr.js` | OCR con Tesseract.js (reemplaza Paperless) |
| `ultra-engine/src/telegram.js` | Bot de Telegram — interfaz de comunicación |
| `ultra-engine/src/db.js` | PostgreSQL pool + helpers |
| `db/init.sql` | Schema completo — 8 tablas + índices |
| `ultra-engine/src/routes/documents.js` | API de documentos + OCR upload |
| `ultra-engine/src/routes/feeds.js` | API de RSS feeds |
| `ultra-engine/src/routes/jobs.js` | API de ofertas de empleo |
| `.env.example` | Variables de entorno requeridas |
| `scripts/deploy.sh` | Script de deploy al VPS |
| `README.md` | Documentación completa del sistema |

---

## 6. Lo Que Falta Para Ser un Producto Completo

### Seguridad — URGENTE
1. **Autenticación del dashboard** — al mínimo basic auth, idealmente JWT
2. **HTTPS** — Nginx reverse proxy con Let's Encrypt
3. **Validación de input** — Joi/Zod en todas las rutas API
4. **Rate limiting** — express-rate-limit en la API
5. **Helmet.js** — Headers de seguridad HTTP
6. **CORS** — Configurar orígenes permitidos

### Pilares pendientes (3, 5, 6, 7)
- **P3 Finanzas**: Integración Wise API, tracking de gastos, cálculo de runway
- **P5 Oportunidades**: Scraper de plataformas freelance, scoring de oportunidades
- **P6 Logística**: APIs de gasolina, clima, Google Maps
- **P7 Bio-Check**: Tracking de energía, hábitos, métricas personales
- Cada pilar necesita: schema DB, scraper/API, scheduler job, ruta API, UI en dashboard

### Dashboard mejorado
- Gráficos (Chart.js o similar) para visualizar tendencias
- Filtros y búsqueda en noticias y ofertas de empleo
- Gestión de feeds RSS y fuentes de empleo desde la UI
- Notificaciones en el dashboard (no solo Telegram)

### Testing
- **CERO tests** en todo el proyecto
- Necesita: tests unitarios para cada módulo, tests de integración para la API, tests E2E

### Monitoring
- Health endpoint existe pero no hay monitoring externo
- Necesita: UptimeRobot, Better Stack, o similar
- Log aggregation (ahora solo console.log)

### Backup automatizado
- backup.sh existe pero no está en el scheduler
- Necesita: backup automático diario de PostgreSQL + upload a S3/B2

### Content hash robusto
- Reemplazar el hash simple por SHA-256 en el scraper

### Eliminar deploy.tar.gz del repo
- Usar GitHub Releases o un registry de artefactos

### Dockerfile optimizado
- Multi-stage build para reducir tamaño de imagen
- Non-root user en el contenedor
- Health check en Docker

### CI/CD
- GitHub Actions: build → test → deploy automático
- Linting y validación de código en PR

### Mobile companion
- App Telegram es la interfaz actual, pero un mini-app o PWA dedicada mejoraría la UX
- Quick actions: marcar oferta como vista, añadir documento, ver estadísticas
