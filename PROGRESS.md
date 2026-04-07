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
