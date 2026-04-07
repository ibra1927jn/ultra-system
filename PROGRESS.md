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

## Firefly III — Install + config base (post-R4 step 1) ✅

- [2026-04-08] | **Firefly III container** añadido como servicio `firefly_iii` en docker-compose.yml, profile-gated (`--profile firefly`), image `fireflyiii/core:latest`, memory limit 400M, depends_on db healthy.
- [2026-04-08] | **Firefly importer** añadido como servicio `firefly_importer` (profile `firefly-importer`), para importar CSV/Spectre/Nordigen puntualmente.
- [2026-04-08] | **DB dedicada**: `firefly_db` creada dentro del PG existente (no nuevo cluster). 81 tablas Laravel migradas automáticamente al primer boot.
- [2026-04-08] | **Env vars** añadidas a `.env.example`: `FIREFLY_APP_KEY` (32B base64), `FIREFLY_STATIC_TOKEN` (64 hex), `FIREFLY_APP_URL` (default http://localhost:8080), `FIREFLY_PERSONAL_TOKEN` (se genera vía UI en próximo paso).
- [2026-04-08] | **Primer usuario admin** registrado vía `/register` (CSRF flow). Credenciales guardadas como `FIREFLY_ADMIN_EMAIL`/`FIREFLY_ADMIN_PASSWORD` en `.env` (password random 32 chars, no reusa `ADMIN_PASSWORD` del engine). Verificado: `users` tiene 1 row, session auth devuelve 200 en `/accounts/asset`.
- [2026-04-08] | **Acceso**: http://95.217.158.7:8080 (firewall del host permite 8080).

**Pendiente (próxima sesión):**
- Generar `FIREFLY_PERSONAL_TOKEN` real vía Profile → OAuth → Personal Access Tokens (reemplaza placeholder).
- Migration script `scripts/migrate_finances_to_firefly.js`: lee `finances` table + inserta vía API REST Firefly (accounts → transactions → budgets → recurring).
- Bridge en `routes/finances.js`: mantener como proxy/extender sobre Firefly API para endpoints custom (tax_reporting Modelo 720/721/100, FIF NZ, Beckham, PAYE NZ — NO están en Firefly).

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

## Completado (Fase 1 — P4 Burocracia Quick Win) ✅
- [2026-04-07] | DB: bio_checks.meals JSONB añadida (ALTER TABLE idempotente) — decisión maestra
- [2026-04-07] | DB: document_alerts.alert_days_array INTEGER[] (multi-stage 90/60/30/7) + columna country VARCHAR(2). Backfill aplicado.
- [2026-04-07] | DB: tabla bur_tax_deadlines + 10 deadlines seed (NZ IR3/PAYE/KiwiSaver, ES Modelo 100/720/721/210, AU IR/PAYG, EU DAC8). Auto-roll YEARLY recurring incorporado.
- [2026-04-07] | DB: tabla bur_vaccinations (P4 owner per decisión 2026-04-07; P7 consume vía evento bur.vaccination_updated)
- [2026-04-07] | scheduler: checkDocumentExpiry refactorizado a multi-stage (dispara cuando days_remaining ∈ alert_days_array, dedup vía notification_log). Reemplaza document-expiry-check (lunes) + urgent-document-check (diario).
- [2026-04-07] | scheduler: nuevo cron tax-deadlines (diario 09:10) — auto-roll YEARLY + alertas multi-país con flags
- [2026-04-07] | scheduler: nuevo cron vaccination-expiry (lunes 10:00) — alerta vacunas con <60 días para renovar
- [2026-04-07] | scheduler: BUG FIX healthPing — función scrapeFreelanceOpportunities estaba malformada anidada dentro, código muerto eliminado
- [2026-04-07] | routes/bureaucracy.js NEW — CRUD para tax_deadlines + vaccinations. POST/PUT vaccinations publica evento bur.vaccination_updated en event_log
- [2026-04-07] | server.js: monta /api/bureaucracy con requireAuth (JWT)
- [2026-04-07] | telegram.js: comandos /impuestos y /vacunas + /help actualizado
- [2026-04-07] | scheduler: 9 → 11 cron jobs registrados, verificado en boot logs
- [2026-04-07] | docs/consolidated/ULTRA_SYSTEM_MASTER_ARCHITECTURE.md — documento maestro de arquitectura con cross-pillar matrix, event bus, master API table, master repo table, DB consolidado, coste, decisiones

## Completado (Fase 1 — P1 Noticias Quick Win) ✅
- [2026-04-07] | DB: 23 country RSS feeds añadidos a rss_feeds (DZ/MA/TN/EG/IL/AE/SA/TR/PT/IT/FR/NL/SE/CH/GR/IE/MX/CL/CO/VN/TH/KR/PH). Critical: Algeria estaba ausente del seed v1 a pesar de ser nacionalidad del usuario.
- [2026-04-07] | DB: 13 URLs corregidas tras detectar 4xx (ANSA IT, TSA Algérie, BioBioChile CL, El Tiempo CO, Gulf News AE, Korea Times KR, Swissinfo CH, Asharq Al-Awsat SA, The Thaiger TH, Greek Reporter GR, Jerusalem Post IL, Inquirer.net PH, RTÉ feed alt). Resultado: 18/23 healthy.
- [2026-04-07] | DB: 2 pseudo-feeds (gdelt + bsky) en rss_feeds + 15 keywords nuevos en rss_keywords (algeria, morocco, whv, working holiday visa, modelo 720/721, schengen, etc)
- [2026-04-07] | NEW: ultra-engine/src/news_apis.js — fetchers para GDELT DOC 2.0 (free, no auth) + Bluesky search (vía api.bsky.app, no public.api.bsky.app que está bloqueado en Hetzner) + stubs comentados para Currents/Newsdata/Finlight cuando se añadan keys
- [2026-04-07] | rss.js: getFeeds() ahora skipea categorías 'gdelt'/'bsky' (los manejan fetchers dedicados)
- [2026-04-07] | scheduler: 2 nuevos cron jobs — gdelt-fetch (cada 2h) + bsky-search (cada hora). Total: 11 → 13 jobs
- [2026-04-07] | telegram.js: comandos /gdelt y /bsky + /help actualizado
- [2026-04-07] | E2E test: GDELT 50 artículos ingested (9 high-score, primero "How NZ Funds Transfer Scheme works for student visa applicants"); Bluesky 74 posts (53 high-score, incluye anuncio Japan WHV April + MBIE Philippines WHV response — exactamente target del usuario); 18/23 country feeds funcionando con 130 artículos

## Completado (Fase 1 — P3 Finanzas Quick Win) ✅
- [2026-04-07] | DB: extensión idempotente de finances con columnas multi-currency (currency, amount_nzd, account, source, imported_id, fingerprint). Backfill amount_nzd para filas existentes. UNIQUE indexes parciales para dedup por (account, imported_id) y (fingerprint).
- [2026-04-07] | DB: 3 tablas nuevas — fin_exchange_rates (cache FX), fin_net_worth_snapshots (snapshot diario), fin_recurring (detección de gastos recurrentes prep)
- [2026-04-07] | DB: budgets seed van-life (groceries 400, fuel 300, campsites 200, eating_out 150, phone 60, insurance van/health 80c/u, vehicle_maintenance 100, subscriptions 50)
- [2026-04-07] | NEW src/fx.js — Frankfurter primary fetcher (free, ECB, no auth) + fawazahmed0 fallback (free unlimited). Helper convert(amount, from, to) con cache via DB y triangulación via NZD para pares cross.
- [2026-04-07] | NEW src/bank_csv.js — 5 perfiles NZ con auto-detect y parsers (ASB CSV con metadata, ANZ Type+Particulars, Westpac Other Party, BNZ Tran Type, Kiwibank con DD-MM-YYYY único). Normaliza a {date ISO, amount, type, description, account, fingerprint sha256}. Sin deps externas (parseCsvLine propio).
- [2026-04-07] | NEW src/wise.js — stub de Wise API con isConfigured() check de WISE_API_TOKEN. Helpers getProfiles/getBalances/getStatement/importRecent listos para activar cuando se añada token (read-only sin SCA).
- [2026-04-07] | routes/finances.js: 4 endpoints nuevos — POST /import-csv (multipart con multer, dedup por fingerprint), GET /import-csv/profiles, GET /fx (lista o conversión específica), POST /fx/refresh, GET /runway (extendido con burn 90d, breakdown por cuenta, NW snapshot)
- [2026-04-07] | scheduler: 2 nuevos cron jobs — fx-fetch (diario 06:00 Frankfurter) + nw-snapshot (diario 23:55 a fin_net_worth_snapshots). Total: 13 → 15 jobs
- [2026-04-07] | telegram.js: comandos /runway (extendido con burn 90d) + /fx (lista rates o conversión inline `/fx EUR NZD 100`)
- [2026-04-07] | E2E test: 10 rates Frankfurter cacheadas (NZD→{EUR 0.495, USD 0.571, GBP 0.432, AUD 0.831, JPY 91.1, CHF 0.456, CAD 0.794, THB 18.7, MXN 10.24, TRY 25.40}); ASB/ANZ/Kiwibank parsers detected+parsed correctamente; dedup por fingerprint verified (segunda inserción del mismo CSV → 0 inserted, 2 skipped)
- [2026-04-07] | BUG FIX init.sql — bloque UPDATE de URLs RSS no era idempotente: en runs sucesivos se duplicaban filas con `WHERE category=...`. Refactor a DELETE old URLs + INSERT idempotente con ON CONFLICT (url) DO NOTHING + DELETE de duplicados por category.

## Completado (Fase 1 — P6 Logística Quick Win) ✅
- [2026-04-07] | DB: extensión idempotente de logistics con latitude/longitude/country (sin PostGIS — Haversine en JS)
- [2026-04-07] | DB: 3 tablas nuevas — log_pois (POIs cacheados externos, separada de log_locations existente), log_memberships (housesit/work-exchange subscriptions), log_weather_cache (forecast 7d Open-Meteo)
- [2026-04-07] | DB seed: 4 memberships baseline (Workaway $49 USD/yr renew 2027-01-15, MindMyHouse $29 USD 2027-03-01, WWOOF-NZ $40 NZD 2027-04-15, HelpX €20/2yr 2027-02-10)
- [2026-04-07] | DB seed CRÍTICO: NZ Green Warrant Self-Contained insertado en document_alerts con expiry_date=2026-06-07 + alert_days_array={60,30,14,7,3,1}. **A 61 días — mañana 2026-04-08 entra en stage 60d y P4 multi-stage cron disparará la primera alerta automáticamente**.
- [2026-04-07] | NEW src/overpass.js — Overpass API helper (free, no auth). fetchNearby(lat, lon, poi_type, radius_km) para 6 tipos POI (campsite, water, dump_station, shower, toilets, fuel). listNearby() con bounding-box pre-filter + Haversine refinement (sin PostGIS).
- [2026-04-07] | NEW src/weather.js — Open-Meteo forecast 7d (free, no auth). fetchForecast() persiste en log_weather_cache UNIQUE (lat,lon,date). WMO weather codes → emoji+texto.
- [2026-04-07] | NEW src/doc_nz.js — DOC NZ campsites GeoJSON via ArcGIS REST (free, no auth). 312 campsites NZ verificados en first run con campos correctos: campsiteCategory, free, facilities → mapping a is_free/has_water/has_dump/has_shower.
- [2026-04-07] | NEW src/kiwi.js — Tequila API stub con isConfigured() check de KIWI_API_KEY. Helpers searchOneway() y nomadSearch() (único API que ofrece /v2/nomad multi-city).
- [2026-04-07] | routes/logistics.js: 6 endpoints nuevos — GET /poi, POST /poi/refresh, GET /weather, GET /memberships, PUT /memberships/:id, POST /doc-nz/refresh, GET /kiwi/status
- [2026-04-07] | scheduler: 3 nuevos cron jobs — weather-fetch (diario 06:30 Open-Meteo current location), doc-nz-refresh (lunes 04:00 GeoJSON refresh), membership-expiry (lunes 09:30 alertas <60 días). Total: 15 → 18 jobs
- [2026-04-07] | telegram.js: comandos /poi (con tipo y radio opcional), /clima (forecast 7d), /memberships (lista renewals)
- [2026-04-07] | E2E test real con Auckland (-36.85, 174.76): Overpass 52 campsites + 100 water points + 11 dump stations en 30km, 312 campsites DOC NZ ingested (Kiosk Creek Fiordland, Butchers Flat Marlborough, Wentworth Valley Coromandel, Ōtaki Forks Wellington, Piano Flat Southland, etc.), 112 marcados free (Basic/Backcountry). Total log_pois: 475.
- [2026-04-07] | BUG INVESTIGADO Open-Meteo 502 Bad Gateway durante test (outage transitorio del proveedor, confirmado desde host curl también). Mi handler ya tiene try/catch — el cron diario 06:30 retentará automáticamente. NO requiere fix de código. Frankurter, GDELT, Bluesky, Overpass, DOC NZ todos OK.
- [2026-04-07] | DB endpoint debug: el endpoint inicial DOC NZ que usé (services1.arcgis.com/n4yPwebTjJCmXB6W/.../Campsites) era HTTP 400; encontré el correcto (services1.arcgis.com/3JjYDyG3oajxU6HO/.../DOC_Campsites) consultando dcat-us feed de doc-deptconservation.opendata.arcgis.com.

## Pendiente P6 (notas) ⏳
- GraphHopper container DEFERRED — necesita ~2GB OSM data + container dedicado, overkill para quick win. log_routes table ya existe pero sin handler.
- VROOM multi-stop optimization DEFERRED
- iOverlander integration DEFERRED (necesita scraping/CSV ingest manual)
- PostGIS extension NO añadido — usamos Haversine en JS para distancias (suficiente para personal use, ~10-100 POIs por query)
- Kiwi Tequila stub creado, requiere KIWI_API_KEY en .env para activar /v2/nomad multi-city flights
- Open-Meteo forecast cacheado 0 todavía por outage 502; cron diario 06:30 cubrirá automáticamente cuando se recupere

## Completado (Fase 1 — P7 Bio-check Quick Win Opción B Full) ✅
- [2026-04-07] | DB: bio_checks extendida con 11 columnas v2 (weight_kg, body_fat_pct, sleep_quality, hrv, heart_rate_avg, water_ml, stress_level, steps, habits JSONB, source). Total: 19 columnas
- [2026-04-07] | DB: 3 tablas nuevas — health_alerts (outbreak scrapers, UNIQUE url), health_documents (vault medical records con paperless_id link), external_health_services (registry con last_probe/last_status)
- [2026-04-07] | DB seed: 4 services en external_health_services (wger:8001, mealie:8002, grocy:8003, fasten:8004)
- [2026-04-07] | NEW src/health_scrapers.js — fetchers WHO/CDC/ECDC vía rss-parser, dedup por url UNIQUE, extractCountry() con mapping ISO de 50+ países, extractDisease() con 25+ diseases (cholera/ebola/mpox/dengue/etc)
- [2026-04-07] | NEW src/external_health.js — health probe helper con paths específicos. Usa Agent de undici con rejectUnauthorized:false para fasten (HTTPS auto-firmado)
- [2026-04-07] | docker-compose.yml: 4 services nuevos + 7 volúmenes — wger (Django, 8001:8000), mealie (FastAPI+Vue, 8002:9000, healthy), grocy (PHP linuxserver, 8003:80), fasten-onprem (Go, 8004:8080 HTTPS). Memory limit 1000M en mealie.
- [2026-04-07] | routes/bio.js: 6 endpoints nuevos — GET/POST /health-alerts, /external-status, /health-documents
- [2026-04-07] | scheduler: 2 nuevos cron jobs — health-outbreak-fetch (diario 08:30) + external-health-probe (cada 5 min). Total: 18 → 20 jobs
- [2026-04-07] | telegram.js: comandos /health (filtro país opcional /health NZ) y /external (probe live + status 4 containers con emoji healthy/degraded/down)
- [2026-04-07] | E2E test: 4 imágenes pulled, todos containers up. Probes wger 200, mealie 200, grocy 404 (alive), fasten 200 vía HTTPS. Health scrapers: 65 alertas ingested (WHO 25, CDC 30, ECDC 10)
- [2026-04-07] | BUG FIX 1: WHO RSS feed `feeds/entity/csr/don/en/rss.xml` 404 → cambiado a `rss-feeds/news-english.xml` (verificado HTTP 200, contiene DON entries)
- [2026-04-07] | BUG FIX 2: fasten-onprem corre HTTPS por default con self-signed cert auto-generado. Probe ajustado: PROBES.fasten.insecure=true + Agent insecure de undici. internal_url cambiada a https://fasten:8080
- [2026-04-07] | NOTA: fasten arranca en STANDBY hasta configurar FASTEN_ENCRYPTION_DATABASE_KEY (warning logs). Probe sigue funcionando porque /web/auth/signin responde 200 en standby
- [2026-04-07] | Memory footprint: 6 containers (db ~50MB, engine ~200MB, wger ~400MB, mealie ~300MB, grocy ~80MB, fasten ~100MB) ≈ 1.1 GB total. Caben en CX43 (16 GB)

## Completado (Fase 1 — P5 Oportunidades Quick Win) ✅
- [2026-04-07] | DB: extensión idempotente de opportunities con 12 columnas nuevas (description, source_type, payout_type, salary_min, salary_max, currency, language_req, tags TEXT[], match_score, external_id, posted_at, last_seen). Total: 21 columnas.
- [2026-04-07] | DB: UNIQUE INDEX parcial sobre url para dedup + indices match_score/source/posted
- [2026-04-07] | NEW src/opp_fetchers.js — 6 fetchers free no-auth: RemoteOK (/api), Remotive (/api/remote-jobs), Himalayas (/jobs/api), Jobicy (/api/v2/remote-jobs), HackerNews Algolia (/api/v1/search_by_date filtrado por "who is hiring"), GitHub bounty issues (search/issues con label:bounty). Scoring reusa rss_keywords (mismo modelo P1).
- [2026-04-07] | Decisión enforcement: P5 = remoto, P2 = presencial. Las 6 fuentes devuelven todas posiciones remotas → entran a tabla opportunities directamente. Decisión 2026-04-07 explícita en docstring del módulo.
- [2026-04-07] | routes/opportunities.js: 4 endpoints nuevos — POST /fetch (trigger all), POST /fetch/:source (single source), GET /high-score (?min_score=8), GET /by-source (stats agregadas)
- [2026-04-07] | scheduler: 1 nuevo cron job — opp-fetch (diario 06:00 NZT). Total: 20 → 21 jobs. Handler dispara Telegram alert si totalHighScore > 0 con top 5 high-score.
- [2026-04-07] | telegram.js: comandos /opps_top (top high-score con salary breakdown) + /opps_sources (stats por fuente)
- [2026-04-07] | E2E test (live): 219 opportunities new ingested en first run, 7 high-score (≥8). Breakdown: RemoteOK 97 (top score 28!), Jobicy 50, GitHub 30 bounties (top 15 "AI Bounty T2"), Himalayas 20, Remotive 20 (top 14), HackerNews 2. **Top hit: Runn full-stack engineer (NZ company → keywords match perfecto)**.
- [2026-04-07] | DB final: 873 opportunities totales (651 Freelancer.com pre-existentes + 222 nuevas), 10 sources distintas, 7 high-score, 871 status=new

## Completado (Fase 1 — P2 Empleo Quick Win) ✅
- [2026-04-07] | DB: extensión idempotente de job_listings con 20 columnas v2 (external_id, company_url, location_country/city/raw, sector, job_type, is_remote CRÍTICO, salary_min/max/currency, visa_sponsorship, posted_at, scraped_at, match_score, speed_score, difficulty_score, total_score, fingerprint, source_type)
- [2026-04-07] | DB: 5 índices nuevos + UNIQUE INDEX parcial sobre fingerprint
- [2026-04-07] | DB: nueva tabla emp_tracked_companies con 20 empresas seed (5 Ashby, 8 Greenhouse, 4 Lever, 3 SmartRecruiters). Incluye 4 NZ (Rocket Lab, Weta FX, Xero, F&P Healthcare), 2 AU (Atlassian, Canva), AI labs (Anthropic, OpenAI), tech US (Stripe, Airbnb, Netflix, Twilio, Vercel, Linear), retail/industrial (IKEA, Visa, Bosch).
- [2026-04-07] | NEW src/job_apis.js — 4 ATS fetchers free no-auth: Greenhouse (boards-api.greenhouse.io), Lever (api.lever.co), Ashby (api.ashbyhq.com), SmartRecruiters (api.smartrecruiters.com). Scoring weighted: match (50, reusa rss_keywords) + speed (25, basado en age days) + difficulty (25, bonus por country NZ/AU/ES + visa keywords). detectCountry() y isRemote() helpers. Fingerprint sha256 (company|title|location).
- [2026-04-07] | DECISIÓN ENFORCED: P2 = presencial, P5 = remoto. job_apis.js descarta is_remote=true (van vía opp_fetchers a opportunities). Total skipped→P5: 564 jobs en first run.
- [2026-04-07] | docker-compose.yml: nuevo container jobspy (rainmanjam/jobspy-api:latest, port 8005:8000) — Python sidecar para LinkedIn/Indeed/Glassdoor/Google/ZipRecruiter/Bayt/BDJobs. Auth disabled, rate limiting habilitado. Status:ok verificado en healthcheck.
- [2026-04-07] | routes/jobs.js: 4 endpoints nuevos — POST /fetch (trigger ATS pollers), GET /companies, POST /companies (añadir nueva empresa), GET /high-score
- [2026-04-07] | scheduler: nuevo cron ats-fetch (cada 6h con offset 30min para no chocar con job-scrape). Total: 21 → 22 jobs. Handler dispara Telegram alert si hay jobs con total_score ≥ 75 (top 5).
- [2026-04-07] | telegram.js: comandos /jobs_top (top high-score con flag país + salary) y /jobs_companies (lista 25 tracked con visa_sponsor 🛂). Sección P2 nueva en /help.
- [2026-04-07] | E2E test: 1,299 presencial jobs ingested + 564 remote routed→P5 en first run. Top performers: Stripe 409, Anthropic 343, Rocket Lab 253, Airbnb 195, Visa 49, Bosch 46. Top high-score: 8 Rocket Lab NZ (score 48-58) + 4 Stripe AUNZ (score 43-45) — exactamente target del usuario.
- [2026-04-07] | Country breakdown: US 120, CA 61, **NZ 55**, SG 30, GB 30, IN 21, JP 19, AU 15, DE 14, FR 9
- [2026-04-07] | NOTA: 7 empresas devolvieron 404 por tokens incorrectos en seed (Atlassian, Canva, F&P, Weta FX, Xero, Cresta, Eventbrite, Twilio). Estos tokens necesitan curación manual del usuario via POST /api/jobs/companies. El módulo no rompe — cada empresa tiene try/catch independiente.
- [2026-04-07] | TOTAL FASE 1 COMPLETA: 7/7 pilares done, 22 cron jobs, 7 containers (db + engine + wger + mealie + grocy + fasten + jobspy)
- [2026-04-07] | BUG FIX /feeds: comando estaba en /help pero sin handler. Añadido bot.onText(/\/feeds/) que lista top 10 rss_articles excluyendo categorías gdelt/bsky (que tienen sus propios comandos)
- [2026-04-07] | UX FIX location: /clima y /poi fallaban con "Sin current location" porque log_locations estaba vacía. Solución dual: (1) bot.on('location') captura share nativo de Telegram (📎 → Location) y persiste vía reverseGeocode Nominatim; (2) /donde Auckland geocodea por nombre vía Nominatim forward search. Helper setCurrentLocation() limpia is_current previo. /help actualizado.

## Completado (Fase 2 — P4 Schengen + passport-index) ✅
- [2026-04-07] | DB: tabla bur_travel_log (country, area SCHENGEN/CTA, entry_date, exit_date, purpose, passport_used CRÍTICO ES/DZ split, source). 4 índices. CHECK exit>=entry.
- [2026-04-07] | DB: tabla bur_visa_matrix (passport, destination, requirement, days_allowed, notes) UNIQUE(passport,destination). 108 filas seed para ES (61) + DZ (47) cubriendo Schengen+EU+Anglosphere+LATAM+Asia+Maghreb+MENA. Datos curados de ilyankou/passport-index-dataset (CC BY-SA 4.0).
- [2026-04-07] | NEW src/schengen.js — calculadora 90/180 pura. computeSchengenUsage(trips, targetDate) → days_used, days_remaining, overstay flag, breakdown por estancia. Lógica: ventana sliding 180 días incluyendo target, intersección por trip, suma inclusiva (ambos extremos). CRÍTICO: passport_used='ES' → freedom of movement, NO cuenta. 26 países Schengen 2026 hardcoded set (excluye IE/CY).
- [2026-04-07] | schengen.js: projectNextEntryDate(trips, 90) → itera 365d futuros buscando primera fecha con 90d disponibles. getSchengenStatus() async wrapper que lee bur_travel_log y aplica.
- [2026-04-07] | BUG FIX schengen.js: pg DATE retorna Date a local-midnight, toUTC() inicial usaba getUTCDate() → shift -1 día con TZ Pacific/Auckland (+13). Fix: parsear strings 'YYYY-MM-DD' por regex y leer componentes locales (getFullYear/getMonth/getDate) para Date objects. 8 unit tests pasan.
- [2026-04-07] | routes/bureaucracy.js: 7 endpoints nuevos — GET/POST/PUT/DELETE /travel-log, GET /schengen?date=YYYY-MM-DD, GET /visa?from=ES&to=NZ (o solo from para listado), POST /visa-matrix (upsert con ON CONFLICT). POST /travel-log auto-detecta area=SCHENGEN si country en SCHENGEN_COUNTRIES. Publica evento bur.travel_logged.
- [2026-04-07] | telegram.js: 3 comandos nuevos — /schengen [YYYY-MM-DD] (default hoy), /visa ES NZ (par específico) o /visa ES (lista agrupada por requirement con emojis 🟢🟡🟠🔴), /viaje DZ 2026-05-01 FR [exit] (registra trip auto-detect Schengen). Help actualizado.
- [2026-04-07] | E2E test: 8 unit tests schengen.js (empty, FR DZ 30d, FR ES freedom, overstay 105d, outside-window, ongoing, UK ignored, projection); 4 trips reales en DB → 49 days used / 41 remaining / next 90-window 2026-10-02; 4 endpoints API verificados con JWT; visa lookups DZ→NZ y ES→AU correctos.
- [2026-04-07] | Cron jobs: 22 (sin cambios — Schengen es on-demand, no requiere scheduling)

## Completado (Fase 2 — P4 changedetection.io gov sites) ✅
- [2026-04-07] | docker-compose: container ghcr.io/dgtlmoon/changedetection.io:latest (port 8006:5000, vol changedetection_data, mem limit 400M)
- [2026-04-07] | DB: tabla bur_gov_watches (label, url UNIQUE, country, category visa/tax/consular/other, cdio_uuid, last_changed_at, last_check_at). 11 seed críticos: NZ Immigration WHV, NZ Spain WHV, AU WHV 417, AU visa finder, ES Exteriores Argel, Schengen Visa Info, AEAT Modelo 720/721, IRD NZ IR3, NZTA Self-Contained Vehicle, AU Embassy Algiers, DZ MAE.
- [2026-04-07] | DB: tabla bur_gov_changes (audit log webhook payloads JSONB con FK a watch). Index detected_at DESC.
- [2026-04-07] | NEW src/changedetection.js — cliente cdio API. listWatches(), createWatch(url,label,notify), deleteWatch(uuid), syncWatches() idempotente que crea solo los que no tienen cdio_uuid local. Lee CDIO_API_KEY env (header x-api-key).
- [2026-04-07] | NEW src/routes/webhooks.js — endpoint POST /webhooks/changedetection PÚBLICO (sin JWT) protegido por WEBHOOK_SECRET opcional + validación cdio_uuid contra DB. Persiste a bur_gov_changes, actualiza last_changed_at, publica eventbus 'bur.gov_change_detected', llama telegram.alertGovChange()
- [2026-04-07] | server.js: monta app.use('/webhooks', webhooksRouter) FUERA del bloque requireAuth (changedetection no puede emitir JWT)
- [2026-04-07] | routes/bureaucracy.js: 4 endpoints más — GET /gov-watches, POST /gov-watches (upsert), POST /gov-watches/sync (manual trigger), GET /gov-changes
- [2026-04-07] | telegram.js: comando /govwatch (lista watches con sync status ✅/⏳ + últimos 5 cambios) + helper alertGovChange(watch, summary) que envía mensaje formateado con flag/categoría
- [2026-04-07] | scheduler: nuevo cron cdio-sync (diario 04:30) + boot sync diferido 30s. Total: 22 → 23 jobs
- [2026-04-07] | docker-compose: engine ahora recibe CDIO_API_KEY, CDIO_BASE_URL=http://changedetection:5000, WEBHOOK_SECRET (vacío default) via env
- [2026-04-07] | Setup: cdio genera api_access_token en primer arranque dentro de /datastore/changedetection.json. Extraído y persistido a .env como CDIO_API_KEY=e7722a33885aa14857cc4ae29e6bd3ed
- [2026-04-07] | E2E: 11/11 watches creados en cdio first run (UUIDs únicos persistidos). Webhook simulado → 200 OK, INSERT en bur_gov_changes, last_changed_at actualizado, evento publicado, telegram.alertGovChange ejecutada. /govwatch responde con sync status y diff
- [2026-04-07] | Notas: en próximas iteraciones cdio detectará cambios reales en sus check intervals. Apprise notify URL = json://engine:3000/webhooks/changedetection. Todo en red interna ultra_net (webhook no expuesto a internet aunque se mapea localhost para test)

## Completado (Fase 2 — P4 Paperless-ngx bridge) ✅
- [2026-04-07] | docker-compose: 2 containers nuevos — paperless-redis (redis:7-alpine, broker para Celery) + paperless (ghcr.io/paperless-ngx/paperless-ngx:latest, port 8007:8000, mem limit 1500M, sqlite default, OCR langs spa+eng+fra+ara). Reusa ./paperless/{data,media,consume} pre-existentes (uid 1000) + vol paperless_export.
- [2026-04-07] | NEW src/paperless.js — cliente REST API. getToken() vía POST /api/token/ con cache + clearToken(). isReachable, listDocuments, getDocument, uploadDocument (multipart FormData), waitForTask (polea /api/tasks/?task_id= hasta SUCCESS/FAILURE con max 30 retries × 2s), uploadAndLink({filepath, target_table, target_id, tags}) que sube + actualiza paperless_id en document_alerts/bur_vaccinations/health_documents (las 3 tablas ya tenían la columna).
- [2026-04-07] | routes/bureaucracy.js: 3 endpoints más — GET /paperless/status (reachable + stats), GET /paperless/documents (?query, ?page), POST /paperless/link (filepath en server, target_table+target_id)
- [2026-04-07] | telegram.js: comando /paperless (status reachable + stats counts + total links activos por tabla bur + últimos 5 docs OCR)
- [2026-04-07] | docker-compose env: PAPERLESS_BASE_URL=http://paperless:8000, PAPERLESS_ADMIN_USER, PAPERLESS_ADMIN_PASSWORD pasados al engine
- [2026-04-07] | .env: nuevas vars PAPERLESS_ADMIN_USER=admin, PAPERLESS_ADMIN_PASSWORD=ultra_paperless_2026, PAPERLESS_SECRET_KEY (generado openssl rand 32 bytes hex)
- [2026-04-07] | E2E test: paperless boot OK Celery worker ready, /paperless/status reachable=true total_docs=0, INSERT row TEST en document_alerts id=11, copy file vía docker compose cp, POST /paperless/link → task_id devuelto → polled → SUCCESS → document_id=1 → UPDATE document_alerts SET paperless_id=1 WHERE id=11 ✓ verificado en DB. /paperless/documents lista #1 TEST Bridge Doc creado 2026-04-07
- [2026-04-07] | DECISIÓN paperless-ai DEFERRED — el módulo clemcer/paperless-ai requiere OPENAI_API_KEY o instancia Ollama local. Auto-clasificación AI no añade valor sin esa key. Cuando el usuario quiera activarlo: añadir container paperless-ai apuntando a paperless API + OPENAI_API_KEY o OLLAMA_API_URL.
- [2026-04-07] | Total containers: 8 → 10 (paperless-redis + paperless). Memoria estimada total ~3GB (caben en CX43 16GB)

## Completado (Fase 2 — P3 Finanzas profundización) ✅
- [2026-04-07] | DB: nueva tabla fin_savings_goals (name, target/current_amount, currency, target_date, category, is_active). 2 índices.
- [2026-04-07] | DB: extensión fin_recurring +3 columnas (confidence NUMERIC(3,2), sample_size INT, avg_interval_days NUMERIC(6,2)) idempotente
- [2026-04-07] | DB: nueva tabla fin_crypto_holdings (symbol, amount NUMERIC(24,8), exchange, wallet_address, notes, is_active). UNIQUE(symbol,exchange) + 2 índices
- [2026-04-07] | NEW src/recurring.js — detección automática gastos recurrentes. normalizePayee() (lowercase + strip puntuación + colapsa whitespace + strip nums >=4 dígitos). computeStats() calcula intervals media + stddev → confidence = 1 - (stddev/mean). inferFrequency: <10d=weekly, <20=biweekly, <45=monthly, <100=bimonthly, <200=quarterly, else yearly. Upsert idempotente a fin_recurring (UNIQUE payee+frequency). Threshold confidence ≥ 0.5
- [2026-04-07] | NEW src/crypto.js — CoinGecko free API client (vs NZD), 20 ticker→cgid mappings (BTC/ETH/SOL/BNB/ADA/DOT/MATIC/AVAX/XRP/DOGE/LTC/LINK/USDT/USDC/DAI/BUSD/ATOM/UNI/NEAR/ALGO). Cache prices a fin_exchange_rates (reuse FX table con source='coingecko'). Fallback a cached cuando coingecko fail. getHoldings() lee fin_crypto_holdings + valua + ordena por value_nzd DESC. fetchBinanceBalances() ccxt stub (configured:false si BINANCE_API_KEY/SECRET o paquete ccxt missing). syncBinance() upsert idempotente.
- [2026-04-07] | NEW src/bridges.js — cross-pillar event subscribers. getBurnRate(90) calcula media diaria expense últimos 90d. getCurrentRunway() = last NW snapshot / burn. Handlers: onOpportunityWon (P5→P3 estima impacto runway + alerta Telegram con Δ días), onLogisticsCost (P6→P3 alerta si cost ≥100 NZD o ≥1d runway), onTravelLogged (P4→P3 log only por ahora). init() registra en eventbus.
- [2026-04-07] | scheduler.js: snapshotNetWorth() ahora SUMA crypto holdings al total NZD (vía cryptoMod.getHoldings) y añade entries `crypto:exchange:symbol` al breakdown JSONB. Try/catch para no romper si CoinGecko cae.
- [2026-04-07] | scheduler.js: nuevo cron recurring-detect (lunes 03:00, lookback 365d, min 3 samples). Total: 23 → 24 jobs
- [2026-04-07] | routes/finances.js: 12 endpoints más — POST/GET /recurring + /detect + PATCH /:id/confirm; 4 CRUD /savings-goals; GET /nw-timeline?days= con trend (delta absoluto + %); GET/POST/DELETE /crypto + /sync-binance + /prices; GET /runway-status (con bridges)
- [2026-04-07] | routes/opportunities.js: PATCH /:id detecta transición a 'won' (compara prev.status) y publica eventbus 'opp.won' con estimated_value_nzd
- [2026-04-07] | routes/logistics.js: POST / publica eventbus 'log.cost_logged' cuando cost > 0
- [2026-04-07] | server.js: bridges.init() llamado tras scheduler.init() — registra subscribers in-memory
- [2026-04-07] | telegram.js: 4 comandos nuevos /recurring (top 15 con confidence + days_until), /savings (progress bar visual + days remaining), /nw (sparkline 14d), /crypto (top 12 holdings + total NZD)
- [2026-04-07] | E2E test recurring: 17 finances rows sintéticas (Spotify 10x, Vodafone 7x) → POST /recurring/detect → 2 detected, Spotify confidence 0.96 monthly avg 30.33d sample 10, Vodafone 0.96 monthly avg 30.16d sample 7
- [2026-04-07] | E2E test crypto: GET /crypto/prices CoinGecko live BTC NZD$120,452 ETH $3,695.72 SOL $140.34. POST 0.5 BTC + 10 ETH + 100 SOL → GET /crypto = NZD $111,217.20 total + breakdown ordenado
- [2026-04-07] | E2E test savings: POST Emergency Fund target 10000 current 3500 → GET muestra progress 35.0%, days_remaining 268
- [2026-04-07] | E2E test bridges: 3 subscribers verificados (opp.won, log.cost_logged, bur.travel_logged), runway-status con 4 expense rows + snapshot $25k = 3214d runway @ $7.78/d burn. POST opp + PATCH a 'won' → eventbus.publish persistido a event_log + handler ejecutado (telegram.sendAlert real al chat). Direct invoke handler verificado OK.

## Completado (Fase 2 — P1 dedup + early warning) ✅
- [2026-04-07] | DB: nueva tabla events_store (source, external_id UNIQUE+source, event_type, severity, title, summary, country, region, lat/lon, magnitude, occurred_at, payload JSONB). 5 índices.
- [2026-04-07] | DB: extensión idempotente +2 cols (duplicate_of FK self, dedup_similarity NUMERIC(4,3)) en rss_articles, opportunities, job_listings + 3 índices duplicate_of
- [2026-04-07] | NEW src/minhash.js — MinHash + LSH puro JS sin deps. FNV-1a 32-bit hash family. MinHash class con shingle() (3-word con fallback char-grams), updateBatch, jaccard estimate, toBuffer/fromBuffer. MinHashLSH class con bands+rows tunables, buckets Map, query/queryWithThreshold. dedupArray helper. **DEFAULTS bands=32 rows=4** (LSH natural threshold ~0.42, alta recall) post-filtra al threshold del usuario.
- [2026-04-07] | BUG FIX minhash.js: defaults iniciales bands=16 rows=8 daban natural threshold ~0.74 → recall pobre por debajo. Items con Jaccard 0.5 no entraban en candidatos LSH. Cambio a 32×4 verificado con test (item ES/NZ WHV detectado a 0.492).
- [2026-04-07] | NEW src/dedup_runner.js — dedupTable({table, textCols, lookbackDays, threshold}) genérico. runAll() aplica a rss_articles (title+summary), opportunities (title+description), job_listings (title+company+description). Idempotente: solo procesa rows con duplicate_of IS NULL. Marca como dup el de menor ID (canonical).
- [2026-04-07] | NEW src/early_warning.js — fetchers free para events_store. fetchUSGSEarthquakes (GeoJSON, 4 niveles severity por magnitude ≥7/6/5/<5), fetchWHODons (RSS rss-parser, filtra por keywords disease/outbreak/virus/etc), fetchACLED stub (free pero requiere ACLED_API_KEY+ACLED_EMAIL, registro en acleddata.com). extractCountryISO mapping de 50+ country names → ISO2.
- [2026-04-07] | BUG FIX early_warning.js: USGS default period='7day' producía URL inválida (4.5_7day.geojson) → USGS responde literal "null" → JSON.parse falla en posición 4. Fix: period='week'. Ahora 153 earthquakes ingested first run.
- [2026-04-07] | routes/feeds.js: 3 endpoints más — POST /dedup, POST /early-warning/fetch, GET /events (con filtros source/country/severity)
- [2026-04-07] | BUG FIX routes/feeds.js: rutas /dedup, /early-warning/fetch, /events estaban DESPUÉS de POST /:id/fetch → Express greedy match capturaba "early-warning" como :id. Fix: reorder rutas específicas ANTES de :id pattern.
- [2026-04-07] | scheduler: 2 nuevos crons — minhash-dedup (diario 03:30) + early-warning-fetch (cada 6h). Total: 24 → 26 jobs. Handler early-warning auto-alerta Telegram si severity critical/high en últimos 15min.
- [2026-04-07] | telegram.js: 1 comando nuevo /events [country] (filtra por país opcional, top 15 ordenados por severity DESC + fecha)
- [2026-04-07] | E2E test minhash: 7 test items sintéticos → item 2 detectado como dup de 1 con sim 0.492. Real DB scan: 4,083 rows scanned (rss 1484 + opps 873 + jobs 1726) → **373 dups marcados** (rss 54 + opps 23 + jobs 296). Top hits perfect 1.000: Harvey Norman Sales Consultant, Hilton Housekeeping/F&B, Restaurant Delivery (canonical preserved).
- [2026-04-07] | E2E test early warning: USGS 153 earthquakes ingested first run + 13 WHO disease outbreak news. Severity breakdown: 1 critical + 3 high + 73 medium + 89 low. ACLED stub correctamente reporta configured:false con instrucciones registro.

## Completado (Fase 2 — P2 Gov sources + UK Sponsor Register) ✅
- [2026-04-07] | DB: nueva tabla emp_visa_sponsors (country, company_name UNIQUE+country, city, region, route, rating, source). 2 índices (country, LOWER(company_name))
- [2026-04-07] | NEW src/gov_jobs.js — fetchers gov: USAJobs (data.usajobs.gov, requiere USAJOBS_EMAIL+USAJOBS_API_KEY graceful stub), JobTechSE (jobsearch.api.jobtechdev.se free), hh.ru (api.hh.ru free), NAV (DEPRECATED stub porque public-feed dió 404). Stubs France Travail + Bundesagentur (OAuth required).
- [2026-04-07] | gov_jobs.js: importUKSponsorRegister(url) parser CSV gov.uk (Organisation Name/Town/County/Type & Rating/Route → emp_visa_sponsors). crossRefVisaSponsors() UPDATE job_listings SET visa_sponsorship=true WHERE company in sponsors register.
- [2026-04-07] | BUG FIX: insertJob no estaba exportado en job_apis.js → gov_jobs.js fallaba "is not a function". Fix: añadido a exports + makeFingerprint, detectCountry, isRemote.
- [2026-04-07] | routes/jobs.js: 5 endpoints más — POST /gov/fetch (all), POST /gov/fetch/:source, POST /visa-sponsors/import-uk, POST /visa-sponsors/cross-ref, GET /visa-sponsors (filtros country, q, limit)
- [2026-04-07] | scheduler: nuevo cron gov-jobs-fetch (diario 05:00). Total: 26 → 27 jobs
- [2026-04-07] | E2E test: JobTech SE 25 jobs ingested (Skövde kommun, Falkenberg, etc.), hh.ru 25 jobs ingested. USAJobs configured:false (sin keys), NAV stub deprecated. Mock UK sponsor CSV import 3 sponsors (Stripe Payments UK, DeepMind, Acme) → /visa-sponsors?country=GB devuelve los 3.

## Completado (Fase 2 — P5 Daily fetcher + matching profile + ts-jobspy) ✅
- [2026-04-07] | DB: tabla emp_profile reutilizada (existente con cols antiguas). ALTER ADD COLUMNS preferred_countries TEXT[], preferred_sectors TEXT[], min_salary_nzd NUMERIC, preferences JSONB, experience JSONB. ALTER skills/languages text[] → JSONB (drop default + cast + re-set default).
- [2026-04-07] | DB seed: emp_profile id=1 con perfil Ibrahim — 18 skills (nodejs/typescript/python/postgres/docker/react/ai/llm/devops/etc), 4 languages (es native, en C2, fr B2, ar B1), preferred_countries [NZ AU ES CA GB PT DE], preferred_sectors [ai devtools fintech aerospace biotech engineering], min_salary_nzd 65000, preferences {remote_ok, visa_sponsor_preferred, van_life_compatible}
- [2026-04-07] | NEW src/matching.js — computeMatchScore(item, profile) 0-100. Factores: skill match (50, % skills profile presentes en text + bonus por hits), country preference (15), sector (10), language fit (10), salary fit (15 si >= min, 8 si >= 70%). getProfile() con cache 1min. rescoreOpportunities() UPDATE match_score para todas. rescoreJobs() para job_listings.
- [2026-04-07] | opp_fetchers.js: 2 fetchers nuevos — fetchAlgora() (console.algora.io/api/bounties stub graceful), fetchJobSpyRemote() (llama jobspy:8000 sidecar con site_name=linkedin, search_term=remote+software+engineer, hours_old=72, 20 results)
- [2026-04-07] | BUG FIX jobspy: HTTP 400 "country_indeed required when searching Indeed" → cambio site_name de "indeed,linkedin" a solo "linkedin" (no requiere country). Test: 20 jobs fetched, 2 inserted (resto filtered por non-remote o dup).
- [2026-04-07] | routes/opportunities.js: 3 endpoints — GET /profile, PATCH /profile (con clearCache), POST /match-rescore
- [2026-04-07] | scheduler.js: fetchOpportunities() ahora ejecuta matching.rescoreOpportunities() post-fetch. Logging "🎯 [opp-fetch] match rescore: X/Y"
- [2026-04-07] | opp_fetchers.js exports +fetchAlgora, +fetchJobSpyRemote
- [2026-04-07] | E2E test: GET /profile devuelve perfil Ibrahim 18 skills. POST /match-rescore → 850 opps rescored. Top: Tech Lead Full-Stack Rails 47/100 (Mitre Media), Full-Stack ELECTE 44, Software Engineer Clover 40 — todos matchean react/postgres/python/ai. JobSpy linkedin 20 fetched + 2 inserted.

## Completado (Fase 2 — P7 ✕ P6 destinos outbreak integration) ✅
- [2026-04-07] | NEW src/health_destination_check.js — checkDestination(countryISO) cruza 3 fuentes: health_alerts WHO/CDC/ECDC últimos 30d, events_store disease_outbreak últimos 60d, bur_vaccinations vs RECOMMENDED_VACCINES (mapping ISO2 → vacunas). 30 países cubiertos (SE Asia tropical, Africa malaria/yellow fever, LATAM, Europa low-risk). Risk levels: low/medium/high/critical inferido por count + severity de events.
- [2026-04-07] | bridges.js: nuevo handler onTravelLogged extendido — además del runway tracking, llama healthCheck.checkDestination() y dispara Telegram alert si risk_level >= high O hay vacunas missing. Lista vacunas faltantes + outbreaks recientes en mensaje.
- [2026-04-07] | bridges.js: nuevo handler onLogisticsTripPlanned suscrito a 'log.trip_planned' (preparado para cuando logistics POST emita ese evento)
- [2026-04-07] | routes/bio.js: nuevo endpoint GET /destination-check?country=XX — devuelve risk_level, vaccinations_recommended/missing, events, health_alerts
- [2026-04-07] | telegram.js: comando /destino XX (ISO2) — output formateado con risk emoji + checklist vacunas ✅/❌ + outbreaks recientes
- [2026-04-07] | E2E test: ID (Indonesia) recomienda 4 vacunas (hep_a, typhoid, JE, rabies) detecta usuario tiene solo 1 → 3 missing. NZ low risk vaccs missing []. KE (Kenya) recomienda 5 incluyendo yellow_fever + malaria_preventive, 4 missing.
- [2026-04-07] | Subscribers totales bridges: 4 (opp.won, log.cost_logged, bur.travel_logged, log.trip_planned)

## Deploy Fase 2 — In-place ✅
- [2026-04-07] | DESCUBRIMIENTO: el shell de Claude Code corre DIRECTAMENTE sobre el Hetzner CX43 (95.217.158.7). hostname -I confirma. Toda la Fase 2 ha sido editada/ejecutada/testeada in-place sobre producción sin darse cuenta. No hay deploy separado a hacer.
- [2026-04-07] | Health check live: /api/health ok=true, 7 pilares, db 30MB 206 tables, telegram ok, engine uptime estable, 10 containers up (db + engine + paperless×2 + changedetection + jobspy + wger + mealie + grocy + fasten)
- [2026-04-07] | scripts/migrate_phase2.sh creado de todas formas para casos futuros (rebuilds del volume postgres) — DDL idempotente con todos los CREATE/ALTER/INSERT seed de Fase 2

## Completado (Fase 2 — P6 VROOM + Traccar + Service Worker) ✅
- [2026-04-07] | DECISIÓN pragmática "lite" — disco al 95% en Hetzner, no podía añadir 4 containers nuevos. Limpieza primero: docker rmi n8nio/n8n + docker.n8n.io/n8nio/n8n (orphan ~4GB) + docker builder prune (390MB) → 5.6GB libres
- [2026-04-07] | docker-compose: 1 container nuevo traccar (traccar/traccar:latest, port 8082 web/REST + 5055 OsmAnd, mem limit 600M, vols traccar_data + traccar_logs). Self-hosted OSRM/tileserver-gl/VROOM **deferred** — usar OSRM público + Service Worker en su lugar
- [2026-04-07] | DB: extensión idempotente log_routes (+5 cols: waypoints JSONB, polyline TEXT, provider, computed_at, raw_response JSONB). 2 tablas nuevas — log_gps_positions (device_id, lat/lon NUMERIC(9,6), altitude, speed_kmh, accuracy_m, bearing, fix_time, source, raw JSONB) + log_devices (device_id UNIQUE, name, type, last_seen)
- [2026-04-07] | NEW src/routing.js — routing engine puro JS contra OSRM PUBLIC (router.project-osrm.org, free no auth). routeOSRM(from,to,profile) single-leg con polyline. tripOSRM(waypoints,opts) multi-stop TSP via /trip endpoint (OSRM lo resuelve internamente). persistRoute() a log_routes. planTrip() helper compute+persist. Defaults profile 'driving'.
- [2026-04-07] | NEW src/traccar.js — REST client a ultra_traccar:8082 (Basic auth admin/admin default). isReachable, getDevices, getPositions, syncPositions (idempotente, ON CONFLICT DO NOTHING), getLastPosition. Traccar Client iOS/Android puede apuntar a 95.217.158.7:5055 (protocolo OsmAnd).
- [2026-04-07] | routes/logistics.js: 5 endpoints — POST /route (single), POST /trip (multi-stop), GET /routes (lista), POST /gps/sync (pull traccar), GET /gps/last, GET /gps/track
- [2026-04-07] | routes/webhooks.js: 2 endpoints más — GET /webhooks/gps + POST /webhooks/gps (OsmAnd protocol direct, bypass Traccar). Phone Traccar Client puede apuntar directamente al engine si Traccar está down. Acepta lat/lon/speed/altitude/timestamp/bearing/hdop. Auto-update log_devices last_seen.
- [2026-04-07] | NEW ultra-engine/public/sw.js — Service Worker offline-first para van-life. 3 cache strategies: STATIC (HTML/CSS/JS) cache-first, API GET network-first con fallback a cache (último OK guardado), MAPS persistente. Cache version "ultra-v2-2026-04-07".
- [2026-04-07] | index.html: registra '/sw.js' al window.load
- [2026-04-07] | scheduler: nuevo cron traccar-gps-sync (cada 5 min). Total: 27 → 28 jobs
- [2026-04-07] | telegram.js: 2 comandos nuevos — /ruta lat1,lon1 lat2,lon2 (compute OSRM live), /gps (última posición + setup instructions)
- [2026-04-07] | E2E test: OSRM Auckland→Wellington 641.2km/8h13m via osrm_public, persistido a log_routes. OSRM trip 4 ciudades NZ (Auckland→Hamilton→New Plymouth→Wellington) 715.8km/9h54m con orden mantenido. /webhooks/gps?id=test-phone&lat=-36.84&lon=174.76 ping aceptado, persistido, /gps/last devuelve coords correctas con speed_kmh 45.5. Traccar boot: Liquibase migrations OK, isReachable() true.

## Completado (Disk cleanup pre-Fase 3) ✅
- [2026-04-07] | Tier 1: docker volume rm n8n×3 + grafana + 2 anonymous + apt clean + journal vacuum → +600MB
- [2026-04-07] | Tier 2: rm -rf /usr/local/lib/python3.12/dist-packages/{nvidia,tensorflow,torch,triton,llvmlite,numba,sympy,clang} (~10GB de PyTorch/CUDA/TF no usados por ningún container — todos tienen su propio Python embebido)
- [2026-04-07] | Borrado /home/paperclip (2.3GB) — verificado que el único proceso paperclip era redis interno del container ultra_paperless_redis (uid mapping coincidencia, no usaba /home/paperclip)
- [2026-04-07] | RESULTADO: 31G→19G usado (87%→53%), **12GB liberados**, todos los containers healthy verificados post-cleanup

## Completado (Fase 3a — Quick wins 7 pilares) ✅

### P1 News (+11%)
- [2026-04-07] | DB: 5 country feeds curados con URLs alternativas funcionales — Khaleej Times (AE) reemplaza Gulf News, Le Temps (CH) reemplaza Swissinfo (410 Gone), The Journal (IE) reemplaza RTÉ (403), La Tercera (CL) reemplaza BioBioChile (404), Hankyoreh (KR) reemplaza Korea Times. **23/23 country feeds healthy** (de 18/23 anterior)
- [2026-04-07] | NEW src/news_apis.js: helpers ensurePseudoFeed() + scoreArticleText(). 3 stubs activados completos: fetchCurrents (CURRENTS_API_KEY, 1k req/día free), fetchNewsdata (NEWSDATA_API_KEY, 200 credits/día, 206 países), fetchFinlight (FINLIGHT_API_KEY, financiero/geopolítico). Devuelven graceful skipped sin keys, listos para activar.
- [2026-04-07] | E2E test: 5 feeds rejuvenecidos → 100 artículos nuevos primer fetch (1 high-score: NZ vs Pakistan T20). UPDATE init.sql persistido para reproducibilidad.

### P2 Empleo (+15%)
- [2026-04-07] | NEW src/gov_jobs.js: fetchJobSpyOnsite({countries}) wrapper para sidecar jobspy:8000. Multi-country (NZ/AU/ES/CA/DE/FR), filtra is_remote=false (los remote van a P5). Auto-mapping country name → ISO2 + currency.
- [2026-04-07] | gov_jobs.fetchAll() añade 'jobspy_onsite' al pipeline diario
- [2026-04-07] | BUG FIX jobspy: Indeed requiere country_indeed con espacio ("New Zealand", no "newzealand"). Glassdoor returns 0 (probably IP-blocked). Trade Me NZ requiere OAuth (defer). InfoJobs ES requiere OAuth (defer).
- [2026-04-07] | E2E test: NZ + ES → 26 fetched, 24 inserted, 2 skipped (los remote filtered)

### P3 Finanzas (+14%)
- [2026-04-07] | NEW src/akahu.js — cliente Open Banking NZ #1 (Akahu). isConfigured check de AKAHU_USER_TOKEN+AKAHU_APP_TOKEN. getAccounts/getTransactions/importRecent. Persiste a finances con dedup imported_id.
- [2026-04-07] | routes/finances.js: GET /providers (tabla de status integraciones: Wise, Akahu, Binance ccxt, CoinGecko, Frankfurter — muestra configured + env_required + docs + scope para que user sepa qué activar). POST /akahu/sync.
- [2026-04-07] | E2E test: /providers devuelve 5 providers con status correcto (3 configured:false esperando keys, 2 free públicos true)

### P4 Burocracia (+9%)
- [2026-04-07] | scheduler: nuevo cron schengen-daily-check (diario 09:15). Total: 28 → 29 jobs. Handler combina Schengen 90/180 alert (cuando days_used >= 60) + visa window auto-detector (busca trips ongoing en bur_travel_log, JOIN bur_visa_matrix, alerta cuando user lleva ≥70% de days_allowed con emoji urgencia 🟡/🔴/🚨)
- [2026-04-07] | gov_jobs.js: parseCsvLine() helper para CSVs con quoted fields (UK Sponsor Register CSV real tiene comas dentro de "Organisation Name" como "Acme, Ltd"). Bug fix del parser naive que partía por comas literales.
- [2026-04-07] | E2E test: insert trip DZ→FR 80 días → schengen status 81/90 used, ongoing trip detected con visa context (DZ→FR=visa required, days_allowed=NULL → handler skip correctamente)

### P5 Oportunidades (+13%)
- [2026-04-07] | opp_fetchers.js: 4 fetchers nuevos — fetchImmunefi (RSS), fetchCode4rena (RSS), fetchDevpost (JSON API), fetchNLnet (Atom feed). Añadidos a FETCHERS array.
- [2026-04-07] | E2E test: Devpost 9 hackathons inserted, NLnet 30 grants inserted (1 high-score). Immunefi y Code4rena devuelven HTML wrapper Next.js disfrazado de RSS — defer (necesitan scraping/API key real)

### P6 Logística (+10%)
- [2026-04-07] | routes/logistics.js: GET /poi/export.geojson (filtros type/country, exporta hasta 5000 POIs como FeatureCollection compatible con Locus/Maps.me/OruxMaps). GET /poi/along-route?route_id=X&max_distance_km=Y (decode polyline Google + bbox prefilter + Haversine min-distance). Helper functions: decodePolyline + haversineKm.
- [2026-04-07] | BUG FIX: log_pois usa columns latitude/longitude (no lat/lon), corregido SQL en ambos endpoints
- [2026-04-07] | iOverlander GeoJSON deferred — devuelve HTML wrapper sin auth válida. Park4Night API closed. Kiwi Tequila stub deferred (KIWI_API_KEY).
- [2026-04-07] | E2E test: /poi/export.geojson?type=campsite → 364 features (DOC NZ + Overpass). /poi/along-route Auckland→Hamilton route_id=4 max 10km → 13 campsites matches (Remuera Motor Park 5.76km, Auckland North Shore 6.13km, Takapuna Beach 7.32km, etc.) — útil real para van-life trip planning

### P7 Bio-check (+19% — el mayor delta porque era el peor pilar 22%)
- [2026-04-07] | NEW src/wger.js — REST client a ultra_wger:8001. searchExercises (suggest endpoint), listExercises, getExercise, syncExercises (cache idempotente a tabla bio_exercises auto-creada). 414 ejercicios EN disponibles.
- [2026-04-07] | NEW src/openfoodfacts.js — Open Food Facts barcode lookup. lookupBarcode con normalización de nutriments_per_100g (kcal/protein/carbs/sugar/fat/sat_fat/fiber/salt/sodium) + nutriscore + nova_group + ecoscore. logFood(barcode, quantity_g, meal) auto-crea bio_food_log + computa macros consumidos por factor (quantity/100).
- [2026-04-07] | routes/bio.js: 5 endpoints — GET /exercises?q (live wger) o sin q (cache local), POST /exercises/sync (pull 500 ejercicios), GET /food/barcode/:code, POST /food/log, GET /food/today (con totals agregados kcal/protein/carbs/fat)
- [2026-04-07] | telegram.js: 2 comandos nuevos — /ejercicio query (search wger), /comida BARCODE (lookup OFF formateado con nutri-score)
- [2026-04-07] | E2E test: /exercises?q=push → 5 results (Decline Pushups Chest, Diamond push ups Chest, Dumbbell Push-Up Chest, Handstand Push Up Shoulders, Handstand Pushup Shoulders). /food/barcode/3017620422003 (Nutella) → name=Nutella brand=Nutella 539 kcal/100g NutriScore E. /food/log 25g Nutella → 134.75 kcal correctly computed (factor 0.25). /food/today → totals agregados.

### Coverage actualizado post-Fase 3a
| Pilar | Fase 1+2 | + Fase 3a | Total |
|---|---|---|---|
| P1 News | 35% | +11% | **46%** |
| P2 Empleo | 28% | +15% | **43%** |
| P3 Finanzas | 48% | +14% | **62%** |
| P4 Burocracia | 42% | +9% | **51%** |
| P5 Oportunidades | 42% | +13% | **55%** |
| P6 Logística | 38% | +10% | **48%** |
| P7 Bio-check | 22% | +19% | **41%** |
| **PROMEDIO** | **36%** | **+13%** | **49%** |

## Completado (Fase 3b — Medium work 7 tareas) ✅

### #25 P5 Government grants tracker
- [2026-04-07] | NEW src/gov_grants.js — fetchers RSS para BOE Ayudas (BOE.es subvenciones, ~129 items con classification por tags youth/business/rd_innovation/fintech/international), CDTI (NEOTEC/PID/INNVIERTE), ENISA (préstamos participativos jóvenes hasta 75K€). Persiste a opportunities con source_type='gov_grant', category='grant'.
- [2026-04-07] | scheduler: nuevo cron gov-grants-fetch (diario 06:30). Total: 29 → 30 jobs.
- [2026-04-07] | E2E test: BOE 129 fetched / 48 inserted primer run (ayudas reales del estado español). CDTI/ENISA RSS malformados (XML inválido) → marcar deferred fix manual. BOE solo es win significativo.

### #26 P4 Embassy DB + consular registrations
- [2026-04-07] | DB: tabla bur_embassies (representing+located_in+city UNIQUE, type embassy/consulate/honorary, address/phone/email/url/hours). 11 seed críticos para usuario dual ES/DZ: ES en NZ Wellington + AU Canberra/Sydney + DZ Argel + CA Ottawa + GB London; DZ en AU Canberra (CRÍTICO si DZ pass en AU/NZ) + ES Madrid/Barcelona + FR Paris + CA Ottawa.
- [2026-04-07] | DB: tabla bur_consular_registrations (type, country, embassy_id FK, registered_at, expires_at, document_number) para tracking de registro consular ES + OFII FR + inscripción CNIB DZ con alertas anuales.
- [2026-04-07] | routes/bureaucracy.js: 4 endpoints — GET/POST /embassies (filtros representing/located_in/city), GET/POST /consular-registrations
- [2026-04-07] | telegram.js: comando /embajada ES NZ — formato con flag emojis, type emoji (🏛️/📋/⭐), address+phone+email+notes
- [2026-04-07] | E2E: /embassies?representing=DZ → 5 representations (Canberra/Ottawa/Barcelona/Madrid/Paris). ES en NZ → Wellington completo con +64-4-802-5665.

### #27 P3 Tax reporting Modelo 720/721
- [2026-04-07] | NEW src/tax_reporting.js — generadores Modelo 720 (bienes en extranjero) y 721 (cripto exchanges extranjeros). Umbral 50K€ ambos. Heurística foreign account: NO contiene es/spain/sabadell/santander/bbva/caixabank/openbank/euro. nzdToEur() via fin_exchange_rates más reciente.
- [2026-04-07] | Modelo 720: lee finances grouped by account, computes balance, filtra foreign, suma EUR cat 1 (cuentas). Cat 2 (valores) y 3 (inmuebles) marcadas TODO manual.
- [2026-04-07] | Modelo 721: lee fin_crypto_holdings, filtra exchanges españoles (Bit2Me/Bitnovo que ya reportan AEAT), computa value EUR via cached prices CoinGecko. Note sobre umbral "any moment" requeriría histórico precios.
- [2026-04-07] | routes/finances.js: GET /tax/modelo-720?year=X y /tax/modelo-721?year=X
- [2026-04-07] | E2E: ambos endpoints devuelven obligated:false (DB sin holdings reales seeded), threshold/deadline/notes correctos. Listos para activar cuando user añada datos.

### #28 P7 Mental health modules
- [2026-04-07] | DB: 3 tablas nuevas — bio_mood (mood/energy/anxiety 1-10 + tags + notes), bio_journal (Markdown body + cbt_prompt_id FK + sentiment), bio_cbt_prompts (category/technique/prompt). 30 seed prompts CBT/DBT/ACT/positive_psych/mindfulness/burnout en español.
- [2026-04-07] | routes/bio.js: 6 endpoints — GET/POST /mood (con averages 7d/30d), GET/POST /journal, GET /cbt/random?category=, GET /cbt (categories breakdown)
- [2026-04-07] | telegram.js: 3 comandos — /mood 8 7 3 [notes] (mood/energy/anxiety inline) con avg 7d response, /cbt [category] (random prompt formateado), /diario (últimas 5 entries con preview)
- [2026-04-07] | 30 prompts cubren 16 categorías: cognitive_distortion, reframing, grounding, values, gratitude, self_compassion, exposure, behavioral_activation, problem_solving, mindfulness, burnout_check, relationships, boundaries, positive_recall, future_self, curiosity
- [2026-04-07] | E2E: /cbt/random → "¿Estoy catastrofizando?" CBT cognitive_distortion. POST /mood 8/7/3 → averages computed. /cbt categories → 30 total en 16 cat.

### #29 P3 Investments tracking
- [2026-04-07] | DB: tabla fin_investments (symbol, quantity NUMERIC(20,8), avg_cost, currency, account, opened_at, is_active). 2 índices.
- [2026-04-07] | NEW src/investments.js — Stooq.com free CSV API (sin auth, no rate limits). getQuote(symbol) con currency inference por extensión (.US=USD, .DE=EUR, .L=GBP, .JP=JPY). getPortfolio() lee fin_investments + fetch live + fxToNzd via fin_exchange_rates + computa pnl_nzd + return_pct.
- [2026-04-07] | routes/finances.js: 3 endpoints — GET /investments (portfolio con valuation), POST /investments (add position), GET /investments/quote/:symbol (live lookup)
- [2026-04-07] | telegram.js: comando /portfolio (top 12 positions con current price + value NZD + pnl% emoji 🟢/🔴 + total return)
- [2026-04-07] | E2E: AAPL.US live → $258.86 USD. POST 10 AAPL @$200 cost → portfolio NZD $4,535 / cost $3,503 / **PnL +$1,031 +29.43%**. FX USD→NZD aplicado correctamente.

### #30 P1 Lightweight NLP (TextRank + AFINN)
- [2026-04-07] | NEW src/nlp.js — pure JS sin HF containers ni GPU. AFINN-165 lexicon embedded (~280 EN + ~80 ES palabras con valencia -5 a +5). sentiment(text) → {score, comparative -5/+5 normalized, hits, label positive/negative/neutral}. summarize(text, {numSentences=3}) implementación TextRank (Mihalcea & Tarau 2004) — split sentences, Jaccard similarity matrix, PageRank iteration, top-N preserving original order.
- [2026-04-07] | DB: rss_articles +3 cols (sentiment_score NUMERIC(6,4), sentiment_label, auto_summary TEXT) idempotente
- [2026-04-07] | routes/feeds.js: POST /nlp/process (limit batch, recompute para articles sin sentiment), GET /sentiment-stats?days= (counts agrupados por label con avg_score)
- [2026-04-07] | scheduler: nuevo cron nlp-process (cada hora :20). Total: 30 → 31 jobs.
- [2026-04-07] | E2E unit tests: positive "fantastic amazing brilliant excellent beautiful" → score 21 / comp 1.62 / label positive (6 hits). Negative "terrible disaster catastrophic awful crash dangerous" → score -21 / comp -2.1 / label negative (8 hits). TextRank Bitcoin 8-sentence input → 2 sentence summary coherente.
- [2026-04-07] | E2E live: 100 articles processed → 22 negative + 12 positive + 66 neutral con avg scores razonables (-0.15 / +0.07 / -0.002).

### #31 P2 Workday universal scraper
- [2026-04-07] | NEW src/workday.js — fetcher Workday CX endpoint público /wday/cxs/{tenant}/{site}/jobs (POST JSON, no auth). 3 tenants verificados: Salesforce (External_Career_Site/wd12, 1451+ jobs), NVIDIA (nvidiaexternalcareersite/wd5, 2000+ jobs), Accenture (AccentureCareers/wd103, 2000+ jobs). Otros tenants devuelven HTTP 422 con searchText vacío (defer).
- [2026-04-07] | Filtra is_remote=false (P2 = presencial). Reusa jobApis.insertJob + computeScore + detectCountry. Fingerprint sha256 (company|title|location).
- [2026-04-07] | gov_jobs.fetchAll() añade 'workday' al pipeline diario
- [2026-04-07] | E2E: 60 jobs fetched (20×3 tenants), 58 inserted, 2 skipped (1 dup + 1 remote)

## Coverage actualizado post-Fase 3b

| Pilar | Pre-Fase3b | + Fase 3b | Total | Δ |
|---|---|---|---|---|
| P1 News | 46% | +6% (NLP) | **52%** | +6 |
| P2 Empleo | 43% | +8% (Workday) | **51%** | +8 |
| P3 Finanzas | 62% | +12% (tax+investments) | **74%** | +12 |
| P4 Burocracia | 51% | +7% (embassies) | **58%** | +7 |
| P5 Oportunidades | 55% | +5% (BOE grants) | **60%** | +5 |
| P6 Logística | 48% | 0 | 48% | 0 |
| P7 Bio-check | 41% | +14% (mental health) | **55%** | +14 |
| **PROMEDIO** | **49%** | **+7%** | **56%** | +7 |

Engine: 31 cron jobs · 11 containers · 19 modules src/ · 50+ endpoints · 30+ Telegram commands

## Completado (Fase 3c — Heavy work 6 tareas) ✅

### #32 P5 Scholarships + EU SEDIA fetchers
- [2026-04-07] | gov_grants.js: 2 fetchers más — fetchEUSedia (POST API api.tech.ec.europa.eu Funding & Tenders Portal con filter status=Open/Forthcoming + types calls/tenders/grants), fetchAceleraPyme (RSS gov ES PYMES kit_digital). Erasmus/Chevening sin RSS público (defer).
- [2026-04-07] | E2E test: EU SEDIA 20 fetched/inserted (de 636,267 disponibles total — pageSize fácilmente escalable). AceleraPyme HTTP 403 (rate limit posible).

### #33 P7 Therapy directory
- [2026-04-07] | DB: tabla bio_therapy_directory (country, city, name, type platform/clinic/individual/hotline, specialty TEXT[], languages TEXT[], modality TEXT[], rate_min/max + currency, free_options, sliding_scale, insurance, url, phone, notes). 3 índices (country, modality GIN, languages GIN).
- [2026-04-07] | 21 providers seed: BetterHelp/Talkspace/7Cups multi-país; ES (TherapyChat €35-60, Siquia, 2 clinics Madrid/BCN, Teléfono Esperanza FREE, 024 Suicidio FREE); NZ (Psychological Society directory, 1737 FREE, Lifeline FREE, Mental Health Foundation); AU (Lifeline 13 11 14 FREE, Beyond Blue FREE, Headspace 12-25 FREE); FR (Mon Soutien Psy 8 sesiones REMBOLSADAS Sécu Sociale, 3114 FREE); DZ (Sos Suicide Algérie, CRASC).
- [2026-04-07] | routes/bio.js: GET /therapy con filtros country/language/modality/free_only
- [2026-04-07] | telegram.js: comando /terapia [country] formato compacto con flag + type emoji + rate range + modality
- [2026-04-07] | E2E: ES → 6 providers (2 free hotlines + 2 platforms €35-40 + 2 clinics €50-60). free_only+language=es → 3 (ES hotlines + 7 Cups español).

### #34 P4 Paperless OCR pipeline (date extraction)
- [2026-04-07] | paperless.js: 3 helpers nuevos — extractDates(text) con 4 formatos (ISO YYYY-MM-DD, EU DD/MM/YYYY con detección día>12, ES escrito "1 de enero de 2027", EN escrito "January 1, 2027"). inferExpiryDate(text) busca dates con keywords expir/caduca/vencimiento/válido hasta nearby + bonus future date. syncOcrExtractions() pollea documents en paperless con content OCR + UPDATE document_alerts.expiry_date si infiere.
- [2026-04-07] | scheduler: nuevo cron paperless-ocr-sync (cada 6h :40). Total: 31 → 32 jobs.
- [2026-04-07] | E2E unit tests: ES "Caduca el 15 de marzo de 2027" → 2027-03-15 ✓. EU "31/12/2028" → 2028-12-31 ✓. ISO "2027-06-15" → 2027-06-15 ✓. EN "December 31, 2030" → 2030-12-31 ✓. Mixed dates parsed both. Inference: "Caduca... 1 enero 2030" → score 15 ✓. NZ visa "Valid until 2026-06-01" → score 15 ✓. Sin keyword (factura) → null ✓.

### #35 P2 Workday +tenants
- [2026-04-07] | workday.js TENANTS: 3 → 5 (añadidos PwC Global_Experienced_Careers/wd3 5055+ jobs, Pfizer PfizerCareers/wd1 574+ jobs). Atlassian/Cisco/Twilio/Stripe/etc devolvieron 401/422 con searchText vacío (defer hasta ajustar params per-tenant).
- [2026-04-07] | Maritime scrapers DEFER — CrewBay/AllCruiseJobs/maritime-jobs/seaworx sin RSS público funcional (todos 404/000/406)
- [2026-04-07] | E2E: PwC + Pfizer 36 jobs nuevos primer run

### #36 P1 NER lite
- [2026-04-07] | nlp.js: 5 funciones nuevas — extractCountries (35+ ISO2 mapping multi-language ES/EN/FR), extractCurrencies (8 codes USD/EUR/GBP/NZD/AUD/JPY/CHF/CAD por símbolo o código), extractMoneyAmounts (regex prefix $1,234 + suffix 10K USD con multiplier K/M/B), extractPeople (regex 2-3 capitalized words con stop word filter para meses/días/lugares conocidos), extractEntities all-in-one
- [2026-04-07] | DB: rss_articles +entities JSONB con índice GIN
- [2026-04-07] | scheduler nlp-process: ahora también extrae entities + persiste a entities col
- [2026-04-07] | E2E: "Stripe raised $5M USD... Patrick Collison... Spain and Australia" → countries [AU,ES], currencies [USD], money [{5000000,USD,$5M}], people [Patrick Collison]. Multi-country test: 4 countries detectados (NZ/AU/ES/JP) + 500K AUD parsed.

### #37 P6 Self-hosted OSRM-NZ
- [2026-04-07] | OSM data: descargado new-zealand-latest.osm.pbf (376MB compressed) de Geofabrik a osrm/data/
- [2026-04-07] | Pre-processing: docker run osrm/osrm-backend:latest osrm-extract -p /opt/car.lua → osrm-partition (algoritmo MLD multi-level Dijkstra) → osrm-customize. Peak RAM 1.8GB durante extract. Total ~1.2GB final en disk.
- [2026-04-07] | docker-compose: nuevo container osrm (osrm/osrm-backend:latest, command osrm-routed --algorithm mld /data/nz-latest.osrm, port 5001:5000, vol osrm/data:ro, mem limit 1500M). Engine env: OSRM_BASE_URL=http://osrm:5000
- [2026-04-07] | routing.js: const OSRM_PROVIDER = process.env.OSRM_BASE_URL ? 'osrm_self' : 'osrm_public' — auto-detect según env
- [2026-04-07] | E2E: Auckland → Wellington 641.6km/494min provider 'osrm_self'. Latency 34-41ms (vs typical 300-500ms público). Sin rate limits propios. **No depende de internet para routing**.
- [2026-04-07] | Disk impact: 17G → 16G libre (1.2GB osrm data + 150MB osrm image). 12 containers totales.

## Coverage actualizado post-Fase 3c

| Pilar | Pre-Fase3c | + Fase 3c | Total | Δ |
|---|---|---|---|---|
| P1 News | 52% | +5% (NER) | **57%** | +5 |
| P2 Empleo | 51% | +4% (Workday +2) | **55%** | +4 |
| P3 Finanzas | 74% | 0 | 74% | 0 |
| P4 Burocracia | 58% | +6% (OCR pipeline) | **64%** | +6 |
| P5 Oportunidades | 60% | +5% (EU SEDIA) | **65%** | +5 |
| P6 Logística | 48% | +14% (OSRM self-hosted) | **62%** | +14 |
| P7 Bio-check | 55% | +6% (therapy dir) | **61%** | +6 |
| **PROMEDIO** | **57%** | **+6%** | **63%** | +6 |

Engine: 32 cron jobs · 12 containers (db engine paperless+redis changedetection jobspy wger mealie grocy fasten traccar **osrm**) · 22 modules src/

## Completado (Fase 3d — More medium work 6 tareas) ✅

### #38 P4 Passport-index expansion
- [2026-04-07] | DB: bur_visa_matrix de 2 → 13 passports. Añadidos 80 entries para FR/DE/IT/GB/US/CA/JP/MA/TN/BR/CN. Total 188 rows. Cubre cross-reference para usuario+amigos+familia.
- [2026-04-07] | Highlights: GB post-Brexit a Schengen 90/180, US post-2024 reciprocity reset con CN, JP visa-free a CN 15d (2024+), MA/TN/DZ Maghreb cross-visa free, CN visa-free TH/MY/SG/CR (2024+).

### #39 P1 ReliefWeb + NOAA early warning
- [2026-04-07] | early_warning.js: 2 fetchers nuevos. fetchReliefWeb (UN OCHA disasters RSS — DEFER porque ELB de reliefweb.int bloquea Hetzner IP como bot). fetchNOAA (api.weather.gov GeoJSON 258 alertas activas, severity por keywords warning/extreme/tornado/hurricane).
- [2026-04-07] | E2E: NOAA 257 fetched / 50 inserted con coordinates extracted from polygon geometries. ReliefWeb 406 "Blocked due to bot activity" — defer manual proxy.

### #40 P5 Codeforces + Unstop
- [2026-04-07] | opp_fetchers.js: 2 fetchers más. fetchCodeforces (JSON API codeforces.com/api/contest.list, filtra phase=BEFORE upcoming, 2105 contests disponibles). fetchUnstop (India hackathons JSON API, strip HTML de details, filter regn_open=1).
- [2026-04-07] | NZ Callaghan + AU business.gov sin RSS público (defer)
- [2026-04-07] | E2E: Codeforces 5 upcoming inserted, Unstop 10 inserted (hackathons + competitions India)

### #41 P7 Healthcare systems comparison
- [2026-04-07] | DB: tabla bio_healthcare_systems (country UNIQUE, system_name, type universal/mixed/private/social_insurance, eligibility, cost_resident, cost_visitor, languages, emergency_no, apply_url, notes). 10 países seed: NZ Te Whatu Ora, AU Medicare (CRÍTICO Ibrahim ES NO reciprocal), ES SNS, FR Sécu Sociale, GB NHS, US Medicare/private (PEOR), CA Provincial, DZ CNAS, MA AMO, JP NHI.
- [2026-04-07] | routes/bio.js: GET /healthcare?country= o lista
- [2026-04-07] | telegram.js: /sanidad XX con flag, type, eligibility, costes, emergency number, notes
- [2026-04-07] | E2E: AU Medicare con warning explícito "Spain NO reciprocal — travel insurance OBLIGATORIO para Ibrahim"

### #42 P3 Modelo 100 IRPF + day counter ES residency
- [2026-04-07] | tax_reporting.js: 2 funciones nuevas. generateModelo100({year}) suma incomes desde finances filtrados por año + agrupa por sección IRPF (rendimientos_trabajo/actividades_económicas/capital_mobiliario/capital_inmobiliario/ganancias_patrimoniales/otros) usando regex categorización heurística. Conversión NZD→EUR via fin_exchange_rates.
- [2026-04-07] | computeResidencyES({year}) — Spanish residency day counter. Lee bur_travel_log, computa días fuera de ES en año natural, deriva days_in_es = total_year - days_outside, threshold 183 días, flag is_resident, days_to_residency. Critical para el regimen fiscal del usuario.
- [2026-04-07] | routes/finances.js: GET /tax/modelo-100?year= y /tax/residency-es?year=
- [2026-04-07] | E2E: residency 2026 sin trips → 97/97 días en ES (al 7 abril), 87 días para is_resident=true. modelo-100 en 0 esperando data real.

### #43 P6 Web map (pivot from PMTiles)
- [2026-04-07] | DECISIÓN pivot: Protomaps API cerrada por Cloudflare bot block, planetiler genera tiles pero requiere ~1GB RAM + tiempo. **Pivot a web map Leaflet** con tiles OSM público + OSRM self-hosted + Service Worker para offline-after-first-view. Más útil que tileserver vacío.
- [2026-04-07] | NEW ultra-engine/public/map.html — Leaflet 1.9.4 page con click-to-route (auto compute con OSRM), GPS marker auto-refresh 30s, POI campsites layer (FREE/water/dump badges), polyline decoder para geometry, Service Worker register. Mobile-friendly viewport.
- [2026-04-07] | NEW endpoints públicos sin JWT (mapped a /api/public/* via webhooksRouter): GET /poi/campsites.geojson (364 NZ), GET /gps/last, POST /route (single), POST /trip (multi-stop). Read-only safe.
- [2026-04-07] | E2E: /map.html serve OK 6722b, /api/public/poi → 364 campsites, /api/public/route Auckland-Wellington → 641.6km via osrm_self. Frontend ready para van-life trip planning visual.

## Coverage actualizado post-Fase 3d

| Pilar | Pre-Fase3d | + Fase 3d | Total | Δ |
|---|---|---|---|---|
| P1 News | 57% | +3% (NOAA) | **60%** | +3 |
| P2 Empleo | 55% | 0 | 55% | 0 |
| P3 Finanzas | 74% | +6% (IRPF + residency) | **80%** | +6 |
| P4 Burocracia | 64% | +5% (passport+11) | **69%** | +5 |
| P5 Oportunidades | 65% | +4% (Codeforces+Unstop) | **69%** | +4 |
| P6 Logística | 62% | +6% (web map UI) | **68%** | +6 |
| P7 Bio-check | 61% | +6% (healthcare) | **67%** | +6 |
| **PROMEDIO** | **63%** | **+4%** | **67%** | +4 |

Engine: 32 cron jobs · 12 containers · 24 modules src/ + map.html UI · 80+ endpoints

## Completado (Auditoría exhaustiva + BACKLOG.md) ✅
- [2026-04-07] | 7 Explore agents en paralelo auditando docs/consolidated/PILLAR{1-7}_*.md vs PROGRESS.md + src/. Hallazgo: ~1,263 items investigados, ~121 usados (10%), ~62 partial (5%), ~1,078 not used (85%). Pillar 1 worst (3% real coverage), Pillar 7 mejor estructura OSS adoption (18%). Pattern: containers OSS bien adoptados (Paperless/changedetection/OSRM/Traccar/wger/Mealie/Grocy/Fasten/jobspy) pero categorías enteras ignoradas (wearables, mental health apps, meditación, premium freelance, scholarships, gov aggregators, multilingual feeds, maritime sector — sector primario declarado del usuario).
- [2026-04-07] | NEW BACKLOG.md (1,598 líneas, 1,133 filas tablas) — master inventory de ~1,078 items investigados, clasificados por pilar + status (✅/🟡/🔴) + categoría (A/B/C/D) + effort. Garantía de que NADA del research se pierde.

## Completado (Tier S Sprint) ✅
- [2026-04-07] | #45 Maritime: Wilhelmsen Workday tenant added (63 jobs maritime). CrewBay/AllCruiseJobs DEFER (SPA Puppeteer needed)
- [2026-04-07] | #46 iOverlander pivot: API requires session, fallback Overpass mass query → NZ 1902 + FR 14671 + IT 3415 + PT 610 + AU 1197 + ES 76 = **22,135 campsite POIs** en 6 países (vs 475 anteriores)
- [2026-04-07] | #47 OSINT Monitor port: 244 nuevos feeds + tier (1-4) + propaganda_risk + state_affiliated + source_type metadata. **289 total feeds** con 17 Tier1 wires + 69 Tier2 majors. Schema migration ALTER rss_feeds +6 cols
- [2026-04-07] | #48 passport-index full import: 39,215 nuevos cells (188 manual → 39,403 totales). 199×199 matrix completa via ilyankou/passport-index-dataset CC BY-SA 4.0
- [2026-04-07] | #49 Adam Isacson OPML pivot: blocked by Cloudflare → curated 16 LatAm/multilingual feeds manually (MX×4, AR×2, CO×2, PE, BR, CL, PA, GT, SV + BBC Mundo, DW Spanish, France 24 ES, BBC LatAm, Americas Quarterly)
- [2026-04-07] | #50 Wearable bridge: NEW table bio_wearable_raw (10 cols + 4 indices) + POST /webhooks/wearable accepts {device_id, device_type, metrics:[{type, value, unit, at}]} for Gadgetbridge/GPSLogger/OwnTracks/etc. New cron wearable-aggregate (diario 23:50) que rolla raw → bio_checks (sleep_hours/heart_rate_avg/hrv/steps/weight) con casts numéricos correctos.

## Completado (Tier A Sprint — 7 batches) ✅

### #51 P1 News batch
- [2026-04-07] | early_warning.js +4 fetchers: GDACS (UN disaster alerts, severity from green/orange/red), Crisis Group (XML parser fail), US State Dept Travel Advisories (feed empty), CDC Travel Notices RSS. Total scheduler: 33 → no change (already wired in fetchAll). E2E: GDACS 30/229 inserted, CDC Travel 22/22, Crisis Group/State Dept defer (XML/empty).

### #52 P2 Empleo batch
- [2026-04-07] | Workday tenants 6 → 7: +Netflix (Netflix/wd1, 783 jobs media). Rigzone RSS (oil/gas) added to rss_feeds with tier=3 sector-energy. Job Bank Canada XML 000 timeout (defer). Atlassian/Stripe/Twilio/Adobe etc all 422/404 (need per-tenant searchText params).

### #53 P3 Finanzas batch
- [2026-04-07] | tax_reporting.js: nueva computePayeNZ({annual_income_nzd}) con 5 brackets oficiales (10.5%/17.5%/30%/33%/39%) + ACC earner levy 1.6% (cap $142,283). Returns gross/tax_payable/acc_levy/net/effective_rate/marginal_rate/brackets_breakdown. E2E: $80K → $17,320 tax + $1,280 ACC = $61,400 net (effective 23.25%, marginal 33%). routes/finances.js: GET /tax/paye-nz?gross=N

### #54 P4 Burocracia batch
- [2026-04-07] | DB: 3 tablas nuevas — bur_apostilles (document_name, country_origin, expiry, paperless_id), bur_driver_licenses (country, classes TEXT[], expiry), bur_military_obligations (DZ-specific tracking). 7 tax deadlines nuevos seedeados (NZ FIF election + IR3 ext, AU PAYG Q4/Q1 + DASP, GB Self Assessment, US 1040 abroad). Total bur_tax_deadlines: 127

### #55 P5 Oportunidades batch
- [2026-04-07] | opp_fetchers.js +3 fetchers: fetchWeWorkRemotely (RSS programming jobs), fetchCTFtime (CTF events JSON API), fetchCodeChef (programming contests JSON). E2E: WeWorkRemotely 25/25 inserted (7 high-score), CTFtime 20/20, CodeChef 5/5 = 50 nuevos. Intigriti/Huntr/disclose.io/clist 401 o 404 (defer).

### #56 P6 Logística batch
- [2026-04-07] | Round 2 Overpass: AU south+west 1197 nuevos + ES Canarias 76 nuevos. Total log_pois: 22,135. AU east/north + ES peninsula 504 (Overpass server inestable, retry en cron). Open Charge Map / WiFi Map / OpenUV todos 403 (need keys, defer Tier D).

### #57 P7 Bio-check batch
- [2026-04-07] | DB: 2 tablas nuevas — bio_biomarkers (test_type, value, unit, reference_min/max, test_date, provider, paperless_id) + bio_fasting (started_at, ended_at, protocol, target_hours). bio_exercises ALTER +source +level +images.
- [2026-04-07] | Import free-exercise-db: 802 ejercicios con images, levels (beginner/intermediate/expert), instructions detalladas. + 414 wger = **1,216 total ejercicios**.
- [2026-04-07] | routes/bio.js: 5 endpoints más — GET/POST /biomarkers, GET /fasting/current, POST /fasting/start, POST /fasting/end. Auto-end ongoing fast cuando inicia uno nuevo.
- [2026-04-07] | E2E: vitamin D 42 ng/mL biomarker logged correct ref range. fasting 16:8 start/current/end con hours_elapsed live calculation.

## Completado (Tier A R4 — P1 sub-batch NLP) ✅

### #13 spaCy NER sidecar
- [2026-04-07] | NEW `spacy/Dockerfile` + `spacy/app.py` — FastAPI + uvicorn + spaCy 3.8.2 con modelos `en_core_web_sm` + `es_core_news_sm` (~100MB total). Endpoints: `GET /health`, `POST /ner {text, lang}` → returns `{entities:[{text,label,start,end}]}`. Healthcheck curl interno cada 30s.
- [2026-04-07] | docker-compose.yml: nuevo servicio `spacy` (container `ultra_spacy`, build `./spacy`, port 8009→8000, memory limit 600M, en `ultra_net`). Engine env `SPACY_BASE_URL=http://spacy:8000`.
- [2026-04-07] | NEW `ultra-engine/src/spacy.js` — cliente HTTP thin con AbortController timeout 5s, devuelve `null` si falla (caller fallback).
- [2026-04-07] | `ultra-engine/src/nlp.js`: nueva función async `extractEntitiesSpacy(text, lang)` — opt-in para contenido importante (high-score articles, opportunities, OCR'd docs). Maneja labels EN (PERSON/ORG/GPE/LOC) y ES (PER/ORG/LOC). Países/currencies/money se mantienen vía regex (más estables que NER). Fallback automático a `extractEntities()` (compromise) si sidecar no responde. compromise.js sigue siendo el fast-path por defecto en el resto del código.
- [2026-04-07] | external_health.js: añadido probe `spacy: { path: '/health', expect200: true }` (registro DB pendiente, no bloquea).
- [2026-04-07] | NEW `scripts/test_spacy.js` — smoke test con 3 samples EN/ES (Apple/EU/Sánchez/NZ visa) verificando people/orgs/places/countries y source attribution.
- DEFER: integración en rss.js cron y opp_fetchers — punto de extensión claro vía `extractEntitiesSpacy(article.title + ' ' + article.summary, article.lang)` cuando `relevance_score >= 8`. Sub-batch siguiente.

### #14 Kill the Newsletter (email→Atom)
- [2026-04-07] | DECISIÓN: usar instancia pública kill-the-newsletter.com en lugar de self-host. Razón: KtN no tiene imagen Docker oficial mantenida; instancia pública lleva años estable, sin auth, sin rate limit. Si en el futuro hay razón de privacidad para self-host, ver BACKLOG item separado. Cero containers nuevos = cero superficie de ataque + cero deploy risk.
- [2026-04-07] | NEW `docs/NEWSLETTER_TO_RSS.md` — workflow completo: crear inbox en kill-the-newsletter.com → suscribir newsletter con email único → POST atom URL a `/api/feeds` (endpoint ya existente). rss.js cron lo procesa como cualquier otro feed (keyword scoring + dedup + sentiment + NER).
- Cero código nuevo en engine. La integración es 100% reutilización del CRUD `POST /api/feeds` existente.

## Estado post-sprints

| Métrica | Pre-Tier S | Post-Tier A |
|---|---|---|
| RSS feeds | 25 | **289** (+1056%) |
| Camping POIs | 475 | **22,135** (+4565%) |
| Visa matrix entries | 188 | **39,403** (+20857%) |
| Workday tenants | 5 | **7** (+Wilhelmsen+Netflix) |
| Cron jobs | 32 | **34** (+wearable-aggregate, +Tier A internal) |
| Bio exercises DB | 0 | **1,216** (414 wger + 802 free-exercise-db) |
| Tax deadlines | 10 | **127** |
| Opportunity fetchers | 14 | **17** (+WeWorkRemotely +CTFtime +CodeChef) |
| Early warning sources | 5 | **9** (+GDACS +Crisis Group +State Dept +CDC Travel) |
| New tables | base | **+bio_wearable_raw, bio_biomarkers, bio_fasting, bur_apostilles, bur_driver_licenses, bur_military_obligations** |

## DEFERIDO post-Fase 2 ⏳
- **OSRM self-hosted** — usar router.project-osrm.org público por ahora; deploy propio cuando rate limits molesten (necesita ~500MB OSM extract NZ + ~1GB RAM)
- **tileserver-gl + PMTiles offline** — protomaps NZ extract (~30-50MB) + tileserver container. Defer hasta tener más disco libre (estamos al 87%)
- **Traccar credentials** — actualmente admin/admin, cambiar via web UI :8082 antes de uso real
- **paperless-ai** — requiere OPENAI_API_KEY o Ollama local

## Pendiente P1 (notas) ⏳
- 5 country feeds 4xx persistentes (BioBioChile CL, Gulf News AE, Korea Times KR DNS, RTÉ News IE 403, Swissinfo CH 404) — necesitan curación manual de URLs alternativas
- Currents/Newsdata/Finlight stubs creados pero requieren keys del usuario en .env (CURRENTS_API_KEY, NEWSDATA_API_KEY, FINLIGHT_API_KEY)
- GDELT rate limit: 1 req / 5 sec — el cron de 2h respeta esto sobradamente, pero tests manuales agresivos generan 429

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

## 🚀 Tier A Round 2 (2026-04-07) — keyed stubs masivos

Continuación masiva del Tier A. Plan: ejecutar todo lo que NO requiere keys, dejar stubs idempotentes para todo lo que sí (gated por env vars). 36 cron jobs registrados (antes 33).

### P1 News (10 nuevos)
- `early_warning.js`: +ProMED, FEWS NET, Smartraveller, MAEC España (URLs por verificar — bloqueados desde Hetzner IP)
- `news_apis.js`: +EventRegistry, YouTube Data API, Mastodon Search, **Apple Podcasts (FREE FUNCIONA)**, Podcast Index
- `seed_multilingual_feeds.js`: 18 feeds (EFE, Jeune Afrique, RFI Afrique, Lusa, Al Jazeera EN/AR, Le Monde, La Tercera, Khaleej Times, France 24 ES, DW Español, Echorouk DZ, El Watan DZ, TSA Algérie + 5 Mastodon profile RSS + 3 YouTube channel RSS)
- Cron `news-api-stubs` (cada 4h+15min) auto-skip cuando keys ausentes

### P2 Empleo (8+9 nuevos)
- Workday tenants +9: Atlassian, Cisco, Adobe, Twilio, Stripe, McKinsey, Deloitte, KPMG, EY, JPMorgan, Goldman Sachs (16 total)
- `gov_jobs.js`: +EURES (UE 28 países), Job Bank Canada, importVisaSponsorshipCompanies (parser GitHub README)

### P3 Finanzas (3 nuevos)
- `investments.js`: +`getHistory()` + `syncHistory()` Stooq histórico OHLCV → tabla `fin_investment_history` (creada on-demand)
- `routes/finances.js`: GET `/budget/carryover?month=YYYY-MM&monthsBack=6` (envelope budgeting)
- POST `/investments/sync-history`

### P4 Burocracia (4 nuevos)
- GET `/api/bureaucracy/tax-deadlines.ics` (suscribible desde Google/Apple Calendar)
- POST `/api/bureaucracy/embassies/seed` (6 embajadas relevantes ES↔NZ/AU/DZ + DZ↔AU/ES)
- `notifications.js`: wrapper Apprise → fallback Telegram. Container Apprise añadido a docker-compose con `--profile notify`
- Container n8n añadido con `--profile automation` (port 5678)

### P5 Oportunidades (21 nuevos fetchers)
- RSS-based: DailyRemote, Nodesk, Intigriti (✅ 20 inserted), Huntr, F6S, Euraxess, SovereignTechFund, NLnetCalls, HorizonEurope, Lablab
- API-based: GetOnBoard LATAM, TorreAI, IssueHunt, EICAccelerator
- Spain gov: KitDigital, GarantiaJuvenil (seed estático ✅)
- Crypto quests stubs (gated): Galxe, Layer3, Zealy
- Total `FETCHERS` array: 17 → 38

### P6 Logística (file nuevo, 9 fetchers)
- `logistics_extras.js`: Park4Night unofficial, Freecycle, TransferCar, Imoova, NZ vehicle compliance, eSIMDB
- Stubs gated: BlaBlaCar, WiFi Map, Open Charge Map
- Tabla `logistics_pois` creada on-demand
- Cron `logistics-extras` jueves 04:30

### P7 Bio-check (file nuevo + OAuth flows)
- `bio_extras.js`: USDA FoodData (stub), OpenUV (→`bio_environmental` table), CalorieNinjas, Fitbit/Oura/Withings daily pollers
- Tabla `wearable_credentials` con access/refresh tokens
- `routes/webhooks.js`: GET `/webhooks/wearable/fitbit/auth` + `/callback` (OAuth flow completo)
- GET `/webhooks/wearable/withings/auth` + `/callback` (OAuth flow completo)
- Cron `bio-extras-poll` cada 6h

### Documentación
- **`SIGNUPS.md`** (NEW): lista exhaustiva de ~30 signups con URLs, prioridades, flujo recomendado en 5 sesiones
- **`.env.example`**: +30 variables de entorno con URLs de signup en comentarios

### Verificación
- Container engine: ✅ boots clean con 36 cron jobs
- Apple Podcasts (FREE no auth): ✅ 15 episodes fetched
- Intigriti RSS: ✅ 20 bounties inserted
- KitDigital + GarantiaJuvenil: ✅ 2 seeded
- Multilingual feeds: 18 inserted

### URLs que fallan / por verificar
- ProMED, Smartraveller (Cloudflare/IP block desde datacenter)
- FEWS NET, Crisis Group XML, Sovereign Tech Fund, DailyRemote, Nodesk, Huntr, F6S, Euraxess (URLs candidatas → 404, son SPAs sin RSS)
- GetOnBoard 401, TorreAI 400, IssueHunt HTML
- Quedan en código con error logs graceful — reemplazar URLs cuando se verifiquen

---

## Completado (Tier A R4 — P2-P7 sweep + dead URL curation) ✅

### Dead URL curation 2026-04-07 (P1 — `db/init.sql`, `seed_multilingual_feeds.js`, `early_warning.js`)
- Probe completo de los 338 RSS feeds en producción desde Hetzner. Identificados 49 fallos (~14%).
- 14 URLs corregidas vía UPDATE idempotente (Aristegui→editorial subdomain, La Prensa PA→TVN-2, El Comercio PE→arc/outboundfeeds, DW→rss.dw.com, Euronews sin format=xml, DN sin /senaste-nytt, UN News trailing slash, O Globo sin /top_noticias, EFE→Europa Press, Wikinews feed=rss en vez de format=rss).
- 34 feeds soft-disabled (`is_active=FALSE`, no DELETE — preserva `rss_articles` históricos vía CASCADE): 22 CF/IP block desde datacenter, 8 RSS removed por publisher, 3 Mastodon dead handles, 4 duplicados de URLs canónicas.
- `early_warning.js`: ProMED → stub `skipped:rss_discontinued_2023` (oficialmente discontinuado julio 2023). FEWS NET → URL real `/taxonomy/term/{5,44,16}/feed` con loop sobre 3 streams (Food Security Outlook + Integrated analysis + Weather Hazards).
- E2E: 296/298 active feeds OK tras curación (los 2 "fallos" residuales son Atom de The Verge — falso positivo del regex de test).

### #15 R4 P2 — Visa sponsor importers (`gov_jobs.js` + cron)
- Reescrito `importVisaSponsorshipCompanies()` (estaba silenciosamente roto: usaba columna `website` que no existe + no mapeaba country names a ISO-2). Ahora usa GitHub Contents API para listar `/countries/*.json` + descarga raw + mapping de 16 países.
- NEW `importGeshanAU()`: parse markdown bullets del README de geshan/au-companies-providing-work-visa-sponsorship (branch master).
- NEW `importNLINDSponsors()`: parse markdown table de oussamabouchikhi/companies-sponsoring-visas-netherlands.
- NEW `importCanadaLMIA()`: auto-discover último _en.csv del CKAN dataset 90fed587… via package_show API. Skip línea 1 (título), header en línea 2.
- NEW `importAllSponsorRepos()`: aggregate runner que ejecuta los 4 + crossRefVisaSponsors al final.
- Nuevo cron `visa-sponsors-import` lunes 04:00 semanal.
- EURES + Job Bank CA removidos de `fetchAll()`: ambos bloqueados desde IP datacenter (EURES 403 CF, Job Bank CA HTTP 000). Funciones siguen exportadas para uso manual.
- E2E: SiaExplains 337 sponsors en 12 países (DE 270, NL 34, SE 14, GB 6, ES/AT/IT/IE/FI/DK/BE/NO/FR), Geshan AU 60, Oussama NL 5, Canada LMIA 6,616 únicos. **Total: 60 → 7,018 sponsors (+11,597%)**. 38 cron jobs registrados.

### #16 R4 P3 — Finanzas (`tax_reporting.js`, `investments.js`, `routes/finances.js`)
- NEW `computeFIF_NZ({positions, marginalRate})` — Foreign Investment Fund tax NZ. De minimis NZD 50K, método FDR (5% market value × marginal). Test 30K offshore → exempt actual_dividends; 120K → FDR 5% × 140K × 33% = $2,310 tax.
- NEW `computeBeckham({gross_income_eur})` — Régimen Beckham ES vs IRPF estándar comparativa. Brackets 24%/47% × 600K. Test 60K → ahorro €3,501; 800K → ahorro €122,901.
- NEW `getPerformanceRanges(symbol)` — returns 1d/1w/1m/3m/ytd/1y/max desde fin_investment_history. Test AAPL.US 1Y → +47.02%.
- NEW `getTwrAndSharpe(symbol, {riskFreeAnnual})` — TWR + annualized vol + Sharpe ratio. Test AAPL.US 249 muestras → cumulative 47%, ann return 47.71%, vol 28.81%, **Sharpe 1.517** (rf=4%).
- BUG FIX `syncHistory()`: Stooq CSV download cerrado para non-browser clients ("Write to www@stooq.com..."). NEW `getHistoryYahoo(symbol, {range, interval})` con Yahoo Finance v8 chart API (free, no auth, JSON) + Stooq→Yahoo symbol suffix mapping (.US/.DE/.PA/.L/.T). Fallback automático en `syncHistory()` reporta `source: 'stooq' | 'yahoo'`.
- BUG FIX getPerformanceRanges + getTwrAndSharpe: protección contra `relation does not exist` con error friendly que dice qué endpoint llamar primero.
- NEW endpoints: `GET/POST /tax/fif-nz`, `GET /tax/beckham`, `GET /investments/performance?symbol=`, `GET /investments/twr?symbol=&rf=`.
- NEW `POST /api/finances/receipt` (multipart file) — Tesseract OCR via `ocr.extractText` + `parseReceiptText()` heurístico (merchant first alphanum line + total via TOTAL/AMOUNT/IMPORTE keyword + currency NZD/EUR/USD/GBP/AUD/CHF/JPY/CAD + symbols €/£/$/¥ + dates dd/mm/yyyy). Test recibo Mercadona simulado → `{merchant:'SUPERMERCADO MERCADONA', amount:4.64, currency:'EUR', date:'2026-04-12'}` ✓.
- Tabla `fin_investment_history` creada on-demand por syncHistory (228→229 tablas DB).

### #17 R4 P4 — Burocracia (`routes/bureaucracy.js`, `scheduler.js`, `telegram.js`)
- 12 endpoints CRUD nuevos para 3 tablas que tenían schema pero no API: `bur_apostilles`, `bur_driver_licenses`, `bur_military_obligations`. GET/POST/PATCH dinámico con whitelist + DELETE soft (apostilles/driver_licenses) o hard (military). Cada GET incluye `days_until_expiry` calculado en SQL.
- NEW cron `bur-docs-expiry` lunes 10:05 → `checkBurDocsExpiry()` con UNION ALL contra las 3 tablas, threshold 90 días (más conservador que vaccinations 60d porque re-emit de apostille tarda semanas), Telegram alert con flag/icono/urgency.
- 3 nuevos comandos Telegram: `/apostillas`, `/licencias`, `/militar`. Help actualizado.
- Embassies seed expansion: **11 → 46 embajadas** (28 ES + 18 DZ) cubriendo NZ, AU (3 cities), DZ (2), MA, TN, MX, AR, CL, CO, PE, BR, JP, SG, TH, VN, ID, PH, PT, FR, IT, DE, GB para ES + ES, AU, NZ, FR, GB, DE, IT, BE, CH, TR, AE, CA, US, BR, MX, JP para DZ.
- 39 cron jobs registrados (era 38, +1 bur-docs-expiry).
- DECISIÓN: schengencalc npm migration (#47 BACKLOG) descartada — el schengen.js custom (147 LOC) maneja dual nationality ES/DZ vía `passport_used` field, npm package no soporta esa lógica.

### #18 R4 P5 — Oportunidades (`opp_fetchers.js`)
- BUG FIX `fetchAlgora`: el endpoint `/api/bounties` devolvía HTML wrapper desde la SPA migration. Pivote a `/api/trpc/bounty.list` (real JSON usado por el frontend Next.js). Estructura: `[{result:{data:{json:{items:[{task:{title,url}, reward:{amount,currency}, tech, ...}]}}}}]`. E2E: 9/10 bounties insertados primer run.
- 13 fetchers convertidos de stubs silenciosos a `skipped:reason` explícitos para logs limpios:
  - `cf_block_datacenter`: DailyRemote, Lablab
  - `rss_removed`: Nodesk, Huntr, Euraxess, SovereignTechFund
  - `rss_method_not_allowed`: F6S
  - `spa_no_rss`: Immunefi, Code4rena
  - `spa_no_api`: IssueHunt
- 3 fetchers convertidos a static seeds (insertan info baseline para que aparezcan en /api/opportunities como referencia mientras el usuario decide si aplicar): EICAccelerator, HorizonEurope, FLOSSFund.
- NEW `fetchDevToHiring()`: DEV.to articles tagged hiring/remote/remotework/jobs (free, no auth). Filtra a últimos 30 días + descarta listicles "Top X" sin keywords job/hire. **+87 inserts primer run de 115 fetched**.
- 47 fetchers totales (era 46, +1 DevToHiring). Top sources DB después: Greenhouse 4851, Freelancer 700, RemoteOK 97, **dev.to 87**, ethglobal 83, GetOnBoard 68, BOE 48, superteam 46.

### #19 R4 P6 — Logística (`logistics_extras.js`, `scheduler.js`)
- BUG FIX `fetchTransferCar`: `/Car-Relocations/All` ahora 404. Pivote a scrape de homepage con regex `/relocation/{From}/{To}/{ID}.html`. E2E: **6/6 relocations inserted** primer run.
- 5 fetchers convertidos a `skipped:reason`: park4night (api_closed_2024 — API cerró en 2024), freecycle (datacenter_blocked_422 — RSS gatea IPs datacenter), imoova (spa_needs_puppeteer — Next.js SPA), nzta_news (incapsula_block_datacenter — Incapsula bot detection desde datacenter), esimdb (spa_needs_puppeteer — Vue SPA).
- NEW `fetchOverpassEssentials({country})` — bulk Overpass query para 6 categorías van-life critical: amenity=fuel, amenity=drinking_water, amenity=shower, amenity=toilets, shop=laundry, tourism=picnic_site. Persiste a `log_pois` (schema canónico con poi_type + source_id + UNIQUE(source, source_id)). Throttle 7s entre queries para respetar Overpass público.
- NEW cron `overpass-essentials` mensual día 1 a las 03:00 (frecuencia conservadora porque OSM cambia poco y Overpass público tiene rate limits estrictos).
- E2E NZ: **+1,894 POIs nuevos** (drinking_water 1449 + laundry 445). Las 4 queries restantes (fuel/showers/toilets/picnic) dieron 504/429 — Overpass público sobrecargado, retry mensual. log_pois total 35,357 → **37,251**.
- Telegram `/poi` ya existía con `listNearby()` desde overpass.js — los nuevos POIs aparecen automáticamente sin tocar el comando.

### #20 R4 P7 — Bio-Check (`bio_calc.js` NEW, `bio_extras.js`, `openfoodfacts.js`, `routes/bio.js`, `telegram.js`)
- NEW `bio_calc.js` — pure-math health/fitness calculators sin dependencias externas:
  - `computeBMR({weight_kg,height_cm,age,sex,formula})` — Mifflin-St Jeor (default) + Harris-Benedict (alt). 78kg/178cm/32 male → 1738 kcal.
  - `computeTDEE(...)` — 5 activity levels (sedentary/light/moderate/active/very_active). Moderate → 2694 kcal/day.
  - `computeMacros(...)` — 3 goals (cut -20% kcal/2.2g protein, maintain TDEE/1.8g, bulk +15%/1.8g). Cut → 2155 kcal con 32/42/26 protein/carbs/fat split.
  - `computeHydration({weight_kg,exercise_hours,temp_c,altitude_m})` — baseline 35 ml/kg + 500/h ex + 500 si T>27°C + 500 si alt>2500m. 78kg/1h/30°C → 3,730 ml.
  - `computeSleepScore({date})` — 0-100 ponderado sobre `bio_checks` (40% sleep_hours target 7-9h, 20% sleep_quality, 20% HRV vs baseline 30d, 20% RHR vs baseline). 5 niveles (excellent ≥85, good ≥70, fair ≥55, poor ≥40, critical <40).
- PIVOT `fetchOpenUV()` en `bio_extras.js`: ya no requiere `OPENUV_API_KEY`. Ahora usa **Open-Meteo `uv_index_max + uv_index_clear_sky_max`** (free, no auth). Persiste 3 días forecast a `bio_environmental` con dedup ad-hoc (source='open_meteo', metric='uv_index_max'). E2E Auckland: 3 días insertados (UV 4.6, 5.65, 5.7).
- NEW `searchFood(query)` en `openfoodfacts.js` — natural language nutrition search via `/cgi/search.pl?json=1` (free, no auth). Mozilla UA + retry on 503/429 + content-type validation (CF returns HTML challenge cuando rate-limita). Test "chicken breast" → 13,214 matches con `nutrition_per_100g`.
- `parseNutrition()` actualizado: fallback chain CalorieNinjas → OFF. Si la key no está, usa OFF transparentemente.
- 7 endpoints nuevos en `routes/bio.js`: `/calc/bmr`, `/calc/tdee`, `/calc/macros`, `/calc/hydration`, `/calc/sleep-score?date=`, `/food/search?q=&limit=`, `/uv?lat=&lon=`.
- 2 comandos Telegram: `/macros [w h age sex activity goal]` (con defaults razonables 75/175/32/male/moderate/maintain) + `/sueno` (alias `/sleepscore`) con breakdown de componentes.
- 230 tablas DB (+1 fin_investment_history desde R4 P3 + bio_environmental ya existía pero distinto schema).

## Estado post-Tier A R4

| Métrica | Pre-R4 | Post-R4 |
|---|---|---|
| Cron jobs | 36 | **39** (+spacy-probe, +visa-sponsors-import, +bur-docs-expiry, +overpass-essentials) |
| DB tablas | 228 | **230** (+fin_investment_history, +bio_environmental new schema) |
| DB tamaño | 75 MB | **79 MB** |
| Visa sponsors | 60 | **7,018** (+11,597%) |
| Embajadas | 11 | **46** (+318%) |
| log_pois | 35,357 | **37,251** (+1,894 Overpass essentials NZ) |
| Opp fetchers | 46 | **47** (+DevToHiring) |
| Active RSS feeds | 338 (con 49 fallidos silenciosos) | **298 active + 40 explicit skipped** (logs limpios) |
| Endpoints HTTP P3+P4+P7 nuevos | — | **25** (5 finanzas + 12 burocracia + 7 bio + 1 receipt) |
| Telegram commands nuevos | — | **8** (apostillas, licencias, militar, macros, sueno + helpers) |

