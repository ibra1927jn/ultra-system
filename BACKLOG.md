# 📋 BACKLOG.md — Master inventory of investigated items

**Generated:** 2026-04-07
**Source:** 7 Explore agent audits comparing /root/docs/consolidated/ research vs /root/ultra-system/ implementation.
**Purpose:** Garantizar que NADA del research (~19,000 lines) se pierda. Todo item investigado tiene status + clasificación + plan de acción.

---

## 🔥 Priority pending (R5+ sesiones)

- [~] **iOverlander 600K POIs** — [2026-04-08 R7] **PARCIAL: Canada done (8,991 POIs), resto pending Unlimited subscription**.
  - **Reconnaissance R7**: el endpoint legacy `placeMap_*` con grid `searchUrl + "searchboxmin=...&searchboxmax=..."` (descubierto reverse-engineering del JS bundle `application-*.js` función `mapGrid_SearchForPlacesInGrid`) **está muerto en backend** — el código JS sigue en el bundle pero `/places.json` devuelve 406 y `app.ioverlander.com` ya no resuelve DNS. Approach #1 (network intercept) descartado.
  - **Endpoint oficial encontrado**: `/countries` enumera ~250 países, cada uno con 4 enlaces `/export/places?countries[]=N&xformat=csv|gpx|json|kml`. Pero la página dice literalmente *"Have an active subscription to iOverlander Unlimited"* — sin login + suscripción paid → 404 silencioso. **Camino limpio si usuario paga Unlimited**: añadir cookie `IOVERLANDER_SESSION_COOKIE` al .env, escribir un fetcher que itere países, parsear con `importIOverlanderCSV()` (ya implementado).
  - **Robots.txt**: explícito `User-agent: ClaudeBot Disallow: /` + `Content-Signal: ai-train=no` bajo EU Directive 2019/790. **Decisión consciente: no se construye scraper** — vía paid o vía community dumps únicamente.
  - **GitHub community search (Approach #2)**: única fuente válida encontrada → `cug/wp_converter` (MIT, Copyright 2024 Guido Neitzer), `sample_data/canada_24_07.csv`, **8,991 POIs reales de Canada export 2024-07** (37 columnas oficiales). Importado 2026-04-08 via `scripts/seed_iov_canada.js` → `log_pois` con `source='ioverlander'`. Distribución: wild_camp 3532, campsite 2030, informal_camp 1642, water 634, shower 515, laundromat 336, fuel 125, mechanic 106. Test query desde Vancouver retorna 439 POIs en 100km en <100ms.
  - **Importer reusable**: `importIOverlanderCSV(buf, {country})` en `logistics_extras.js` parsea cualquier export oficial iOverlander (las 37 columnas), mapea Category → poi_type, amenities Yes/No → tri-state booleans, restantes a `tags` JSONB. Cuando usuario active Unlimited el mismo importer procesa los 250 países sin cambios.
  - **Telegram /iov**: comando on-demand `/iov [tipo] [radio_km]` lee de log_pois local filtrado por source='ioverlander' usando `overpass.listNearby` extendido con filtro `source`. Default radio 50km. Cero requests a iOverlander online — 100% sobre el cache local, respeta el opt-out triple del sitio. Si 0 hits informa que dataset es Canada-only y sugiere Unlimited.
  - **Pendiente**:
    1. Decisión usuario: ¿pagar iOverlander Unlimited (~$X/año, no verificado precio)? Si sí → 1 sesión de 1h para construir el fetcher oficial paginado por país y rellenar los otros 249 países (~600K POIs adicionales).
    2. (opcional) Email a iOverlander pidiendo export académico/personal multi-país sin Unlimited.
  - Prioridad: **media** (Canada done cubre Norteamérica, NZ ya tiene Park4Night+DOC NZ+Overpass, EU tiene Park4Night).



- [x] **~~Park4Night van-life POIs~~** — **DONE 2026-04-08** (R5 step 5).
  - **Approach ganador: híbrido sitemap + Puppeteer.** Sitemap-index tiene 91 files, cada uno con ~4K URLs `/en/place/{id}`. Cada detail page tiene la lat/lon **bakeada en la URL del static-map thumbnail** (`cdn3.park4night.com/img_cache/streets-v2/{zoom}/{lat}/{lon}/{color}/{WxH}.jpg`). No JSON-LD, no og:geo, no JSON API — pero la coord está en el atributo `src` de un `<img>`. Puppeteer necesario porque ~50% de las requests via plain curl reciben un CF JS challenge que devuelve 32KB blank HTML.
  - **Implementación**: `fetchPark4Night({batchSize})` en logistics_extras.js. Tabla de estado `p4n_crawl_state` (id=1 row) con cursor `(sitemap_idx, place_idx, place_ids_cache_jsonb)`. Cada run: si cache vacío descarga sitemap-N, parsea IDs únicos, caches. Procesa batch, scrape via `pup.scrape({evaluate})` extrayendo `{title, coord, desc}`. Regex lat/lon desde coord URL, insert en `logistics_pois` con `external_id=p4n:{id}`, category=`camping_van`.
  - **Cron dedicado**: `park4night-crawl` cada 2h, batchSize=30 → ~360 places/día. Sitemap-1 (4168) en ~12 días. Escalable subiendo batchSize si hace falta.
  - **Verified en prod**: primer batch=5 (5/5 insertados, 0 errors), segundo batch=25 (25/25, 0 errors). Lat/lon reales francesas (43°-50°N, -2°-7°E, coincide con IDs bajos = entries originales francesas).
  - **Descoperado de paso**: bug en `puppeteer-sidecar/server.js` con el param `evaluate` (corría en Node, no en page context) — fixed en commit `ffd3059`.

- [ ] **eSIMDB plans reactivation** — [2026-04-08] descope en R5 step 3.
  - Contexto: esimdb.com/new-zealand sí carga con Puppeteer pero el DOM es ruidoso (1888 `[class*=price]`, 2587 `[class*=provider]`, 0 anchors a detail). Los planes se renderizan en Vue components anidados sin `data-*` estables.
  - Approaches a probar:
    1. Inspección manual devtools para encontrar un contenedor estable (ej: `.plan-card-wrapper > div`) y extraer via `evaluate` (ya fixed en sidecar).
    2. Network tab: ¿hay una GraphQL/REST interna que devuelva JSON? Esimdb tiene API pública en esimdb.com/api.
  - Prioridad: **media** (cobertura eSIM NZ ya parcial, no bloqueante para el usuario).

- [ ] **IssueHunt reactivation** — [2026-04-08] descope en R5 step 3.
  - Contexto: /explore devuelve 0 anchors con Puppeteer. La API /api/v1/issues devuelve HTML wrapper sin session token. Frontend usa auth session-bound.
  - Approaches:
    1. Requiere crear cuenta IssueHunt y capturar session token → pasa a step 4 (signups al final).
    2. Scrapear subdomain `issues.issuehunt.io` que es server-rendered por repo.
  - Prioridad: **baja** (Algora + GitHubFund cubren parcialmente el OSS bounty space).

---

## 💀 Investigated dead-ends (R6 2026-04-08)

Fetchers probados exhaustivamente vía Puppeteer sidecar durante R6 sweep y confirmados como no-reactivables con el approach actual. Mover a aquí evita re-intentar en futuras sesiones.

| Source | Razón confirmada |
|---|---|
| **Nodesk** | /remote-jobs/ y /remote-jobs/{cat}/ cargan 1200+ anchors pero 0 a job detail pages. Los jobs son server-rendered pero el click redirige vía JS handler a careers externos, sin URL estable scrapable. |
| **F6S** | /programs devuelve 558 links, ~168 son nav/action (events, jobs, create-*), 0 son slugs de programas reales. Programas detrás de lazy-load AJAX. |
| **Euraxess** | /jobs/search devuelve 283 links, 1 detail real. Resultados de búsqueda cargados vía AJAX después del initial page load. Requiere scroll-trigger o API intercept. |
| **SovereignTechFund** | /news devuelve 51 links, 0 match con el host (contenido probablemente en iframe/CDN). Markup peculiar, deferido. |
| **Freecycle** | /posts devuelve "404 Error" page. Freecycle rehizo el site, el listado público requiere login. Step 4 territory. |
| **NZTA** | /news con Incapsula sigue bloqueado incluso con Chromium (probable fingerprinting sobre UA/IP). Sin solución sin proxy residencial. |
| **ProMED** | RSS discontinuado 2023. Feed realmente muerto upstream, no hay sustituto público. |

Reactivables solo con approaches más complejos: API intercept post-page-load, click event simulation, auth-bound scraping, o proxy residencial. Todas pasan el bar de "demasiado caro para el valor marginal" excepto si futuros cambios en el upstream lo faciliten.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Used (fully integrated, active in production) |
| 🟡 | Partial (stub exists, missing keys, incomplete, or seeded but not wired) |
| 🔴 | Not used (zero implementation) |

| Category | Definition |
|---|---|
| **(A) INTEGRATE NOW** | Free, no auth, 1-4h work, no blockers — can ship today |
| **(B) REPLACES CUSTOM** | Mature OSS that would replace code we already wrote (refactor) |
| **(C) NEW FUNCTIONALITY** | Adds capability we don't have, may need infra/effort |
| **(D) BLOCKED** | Requires user action (API key, OAuth, payment, hardware) |

**Total inventory:** ~1,263 items investigated · ~121 used (10%) · ~62 partial (5%) · ~1,078 not used (85%)

---

## Index

1. [Pillar 1 — News](#pillar-1--news)
2. [Pillar 2 — Employment](#pillar-2--employment)
3. [Pillar 3 — Finance](#pillar-3--finance)
4. [Pillar 4 — Bureaucracy](#pillar-4--bureaucracy)
5. [Pillar 5 — Opportunities](#pillar-5--opportunities)
6. [Pillar 6 — Logistics](#pillar-6--logistics)
7. [Pillar 7 — Bio-check](#pillar-7--bio-check)
8. [Cross-cutting infrastructure](#cross-cutting-infrastructure)
9. [Tier S items](#tier-s-items)
10. [Tier A quick wins](#tier-a-quick-wins-150)

---

## PILLAR 1 — NEWS

**Coverage real:** ~30%+ post P1 finalization 2026-04-11 (was 3% al snapshot inicial)
~~Worst pillar.~~ Custom NLP/dedup/sentiment built when mature OSS existed. ~~25/379 OSINT Monitor feeds (6.6%)~~ → **390 osint_monitor activos** (target excedido). ~~Zero multilingual sources beyond English/Spanish~~ → 130+ países cobertura B3a-d. ~~Zero social beyond Bluesky search~~ → Bluesky firehose + Telethon 10 channels + Mastodon + YouTube.

> **⚠️ STATUS UPDATE 2026-04-11** (los marks 🔴/✅ debajo NO están sincronizados línea a línea — leer este resumen primero):
>
> **Hecho desde último snapshot del BACKLOG:**
> - ✅ OSINT Monitor port (B2): 238→390 feeds activos
> - ✅ Bluesky firehose Jetstream (B7) — WS persistente sustituye polling REST
> - ✅ Mastodon API + YouTube Data API v3 (Tier A R4 2026-04-07)
> - ✅ Telegram via Telethon (B9): 10/14 OSINT channels live, sidecar `ultra_telethon`
> - ✅ Currents + Newsdata + Finlight + YouTube keys activadas (2026-04-09, 7/8 fetchers Fase 4 LIVE)
> - ✅ Apple Podcasts Search (R4)
> - ✅ FEWS NET (R4) + WHO DONS (R4) + NOAA (R3)
> - ✅ spaCy NER sidecar (`ultra_spacy` container, en/es models)
> - ✅ MinHash+LSH dedup pure JS (`minhash.js`, Phase 2)
> - 🟡 GDELT GEO 2.0 — **reinterpretación práctica**: NO es GEO 2.0 real (`/api/v2/geo/geo` está deprecada 404). Sustituido por `mode=TimelineVolInfo`+`TimelineTone` con z-score 28d → `wm_gdelt_geo_timeline` + `wm_gdelt_volume_alerts`. 25/29 países hotspot activos. Cron 6h. Commit 287d3d8 + 52c8b72.
> - 🟡 GDELT CAST forecasting — **NO se ha hecho el real**. La z-score volume sirve como "CAST de pobre" pero no llega al AUC 86-94% del paper.
> - 🟡 BART/PEGASUS/twitter-roberta → **B8 NLP sidecar 2026-04-11** (`ultra_nlp` FastAPI+transformers): sustituidos por `distilbart-mnli-12-3` + `distilbart-cnn-12-6` + `twitter-xlm-roberta-base-sentiment` + `paraphrase-multilingual-MiniLM-L12-v2` + `opus-mt-mul-en`. Lazy LRU max 2 modelos en RAM. Modelos cacheados en `/mnt/HC_Volume_105271265/nlp_models` (3.9GB). Hook fire-and-forget en `rss.js` cuando `score >= SCORE_THRESHOLD`. Tabla `rss_articles_enrichment` (JSONB embedding). Commit 1f366ae.
> - ✅ Cross-pillar feeds layer (B1): 25 feeds con `target_pillar`/`pillar_topic` → routed via `cross_pillar_intel` table + `news.cpi` eventbus + telegram `/cpi` (B6).
> - ✅ Regional aggregators (B3 a+b+c+d): 98 feeds en 4 sub-bloques. Cobertura 49→130 países, footprint 79→157.
> - ✅ Intel watches CDIO (B5): 33 watches en `intel_watches` (10 policy 1h + 23 country 3h), webhook `/webhooks/intel-watch` → `intel.watch.change` event.
> - ✅ Multilingual Sentence-BERT — cubierto por B8 `paraphrase-multilingual-MiniLM-L12-v2` (384d).
> - ✅ Helsinki OPUS-MT — cubierto por B8 `opus-mt-mul-en` (any→en).
> - ✅ bart-large-mnli zero-shot — cubierto por B8 `distilbart-mnli-12-3` (versión ligera).
>
> **Reclasificado a Hetzner-blocked (NO son rotos, auto-recovery post-migración Windows):** ver `HETZNER_BLOCKED.md`
> - 🟡 Reddit RSS (`reddit.com/r/*/.rss`) — 403 datacenter
> - 🟡 ProMED-mail — Cloudflare block
> - 🟡 Smartraveller AU — Cloudflare block
> - 🟡 ReliefWeb UN OCHA — HTTP 406 bot activity
> - 🟡 MAEC España travel advisories — HTML antibot challenge
> - 🟡 Adam Isacson OPML LatAm 140+ feeds — pivot a 16 curados manualmente
>
> **Verdaderamente desactivados como rotos (saneado 2026-04-11):**
> - ❌ FXStreet [CF] — 403 Cloudflare crónico
> - ❌ BOE Sección II.B — `boe.es/rss/canal.php` devuelve 200 con body vacío en TODAS las secciones (RSS upstream roto)
> - ❌ FundsForNGOs — `www2.` 301 → `www.` 403 CF
> - ❌ Vanuatu Daily Post — 429 IP-rate-limit en todas las paths
>
> **Pendientes Tier A P1 verificados 2026-04-11 (segundo pase):**
>
> Hallazgos al verificar uno por uno con grep + curl + DB query:
>
> - ✅ **GDACS** YA implementado en `early_warning.js fetchGDACS()`, en `fetchAll()`, en cron `early-warning-fetch` cada 6h. **62 rows en `events_store` source='gdacs', última 2026-04-11 15:01.** El BACKLOG decía 🔴 incorrectamente.
> - ✅ **International Crisis Group** YA implementado en `fetchCrisisGroup()`, URL `https://www.crisisgroup.org/rss.xml` funciona. **37 rows source='crisis_group', última 2026-04-11 00:09.** El BACKLOG decía 🔴 incorrectamente.
> - ✅ **US State Dept Travel Advisories** YA implementado en `fetchUSStateDept()`, URL `https://travel.state.gov/_res/rss/TAsTWs.xml` (272KB). **75 rows source='us_state_dept'.** Update irregular del lado gov pero funciona.
> - ✅ **CDC Travel Notices** YA implementado en `fetchCDCTravelNotices()`, URL `https://wwwnc.cdc.gov/travel/rss/notices.xml` funciona. **22 rows source='cdc_travel'.** Stale 18 días pero **es upstream** (CDC publica irregular, último pubDate=2026-03-24 confirmado).
> - 🟡 **Kill the Newsletter** NO necesita implementación: `docs/NEWSLETTER_TO_RSS.md` documenta workflow manual usando instancia pública kill-the-newsletter.com. `rss.js` ya consume Atom feeds. Solo workflow del usuario (generar email KtN → añadir Atom URL a `rss_feeds`).
> - ❌ **GDELT CAST forecasting (AUC 86-94%)** ENDPOINT DEPRECADO permanentemente. Verificado 2026-04-11: `api.gdeltproject.org/api/v2/cast/cast`, `/v1/cast`, `www/cast/`, `/forecast/forecast` todos devuelven 404. El z-score de B4 NO es "sustituto" — es la única opción real. Item se queda como `imposible_upstream_dead`.
> - ❌ **GDELT Context 2.0** vivo pero sin value-add. Verificado 2026-04-11 con 6 queries: el endpoint `/api/v2/context/context?query=X&format=JSON` devuelve schema `{"articles":[{url,title,seendate}]}`, **idéntico a `/doc/doc?mode=ArtList`** que ya consumimos en `wm_intel_articles`. No hace topic expansion / topic modeling como decía el BACKLOG. `mode=ContextSimple/ContextThemes` → "Invalid mode". Marcado `endpoint_alive_but_no_value_add` — implementarlo sería duplicar `/doc/doc` con peor schema.
> - 🔴 **RSS-Bridge container** NO existe en repo. Ningún sidecar nuevo añadido. Implementable, ~1.5h. Multiplicador alto: una vez instalado, decenas de fuentes nuevas accesibles vía bridges (Twitter/X, Telegram channels, Substacks, Reddit alt, etc).
> - 🔴 **Podcast Index** bloqueado por email empresa (sin solución corto plazo).
>
> **Conclusión**: el "Tier A pendiente" real era solo **RSS-Bridge** (✅ done @ 204d795) + GDELT Context 2.0 (descartado tras verificación, no es topic expansion). Los otros 6 items o están hechos, o son workflow manual, o son upstream-dead.
>
> **Tier A P1 implementable = 0 items.** Lo que queda pendiente son bloqueos externos (B10/B11/B12 + EventRegistry/PodcastIndex emails empresa) o trabajo de Lote C (Crawl4AI/news-please/Fundus, frontend, deprecar legacy) o B17 re-sourcing (alternativas BOE/Vanuatu/FXStreet/FundsForNGOs).
>
> **── Fase 1+2 seed expansion 2026-04-11 (sesión final P1) ──**
>
> Tras cerrar B14 RSS-Bridge, push adicional de seeds verificados uno por uno:
>
> **Country/regional gaps (Fase 1)** — 9 feeds nuevos + 2 deferred fixed:
>  - ✅ Times of Central Asia (regional, Central Asia)
>  - ✅ elDiario.es (multilingual-es)
>  - ✅ Agência Brasil (multilingual-pt)
>  - ✅ Caribbean360, WIC News (regional Caribbean)
>  - ✅ AllAfrica Comoros (KM), AllAfrica Equatorial Guinea (GQ)
>  - ✅ PINA Pacific Islands News Association
>  - ✅ Maritime Executive (cross-pillar P2 maritime — sector primario)
>  - ✅ Challenger Gray (id 815, era pseudo://deferred → URL real, P2 layoffs)
>  - ✅ GrantWatch (id 834, era pseudo://deferred → URL real, P5 grants)
>  - 🗑️ Layoffs.fyi pseudo://deferred (id 813) borrado — duplicado de id 453 activo
>
> **Cross-pillar P2/P3/P4 (Fase 2)** — 7 feeds nuevos:
>  - ✅ Atlantic Council Econographics (P3 macro-finance)
>  - ✅ ForexLive (P3 forex)
>  - ✅ VisaGuide.world News (P4 visa-info — disparó 2 high-score primer fetch: NZ Golden Visa, Morocco AFCON)
>  - ✅ Splash247 (P2 maritime)
>  - ✅ gCaptain (P2 maritime)
>  - ✅ MarineLink (P2 maritime industry)
>  - ✅ Hellenic Shipping News (P2 maritime)
>
> **Resultado E2E**: 226 rows nuevos en rss_articles primer ciclo (125 Fase 1 + 101 Fase 2), 2 alertas high-score P4 reales, B6 bridges + B8 NLP enrichment validados sobre datos reales.
>
> **Descartados durante verificación** (CF block, 404, dead, 403):
>  - MENA: MENAFN, Middle East Eye, The New Arab, Al Arabiya, Mideastwire — todos CF/404 desde Hetzner. → B17 re-sourcing
>  - SkillSyncer (P2): 404 ambas variantes
>  - TrueUp Layoffs (P2): 403 CF crónico (id 814 sigue como deferred placeholder)
>  - CryptoSlate, CentralBanking, ForexNewsAPI, Henley Passport, Digital Nomad World, USCIS direct, Nomad List visa-index: 403/404/000
>  - Atlantic Council CBDC tracker: 403 (sub-blog blocked)
>  - DLNews: ya existía como id 818
>
> **5 fuentes maritime totales LIVE** (Maritime Executive + Splash247 + gCaptain + MarineLink + Hellenic Shipping News) — desbloquea P2 sector primario que estaba al 0%.
>
> **── B17 Re-sourcing CERRADO 2026-04-12 ──**
>
> El B17 era un placeholder para alternativas de los feeds rotos del saneado. Verificación tier-by-tier:
>
> - 🟢 **FXStreet** [CF block] — ya cerrado en Fase 2: `ForexLive` cubre el mismo nicho mejor (25 items/ciclo, sin CF, P3 forex)
> - 🟢 **FundsForNGOs** [CF block] — ya cerrado: `GrantWatch` (Fase 1 fix) + `ProFellow` + `ICTworks` (ya en B1) cubren grants/funding P5
> - 🟢 **MENA 4/5** vía Google News site search workaround (no IP block):
>   - MENAFN → `news.google.com/rss/search?q=site:menafn.com` (id 1859, 20 rows)
>   - Middle East Eye → idem (id 1860, 19 rows + 1 high-score "Pope to pay homage to Algeria's St Augustine" relevante DZ)
>   - The New Arab → idem (id 1861, 20 rows)
>   - Al Arabiya English → idem (id 1862, 2 rows)
> - 🟢 **BOE España** → Google News site search (id 1863, 20 rows P4 legal-es). **Sub-task pendiente para sesión P4**: módulo `boe_oficial.js` usando API JSON oficial `https://www.boe.es/datosabiertos/api/boe/sumario/YYYYMMDD` con `Accept: application/json` (verificado funciona, devuelve sumario estructurado por sección/departamento). Persistir a tabla nueva `bur_boe_publications`. ~1.5h trabajo P4.
> - 🟡 **Mideastwire** — sin alternativa viable (rsshub 403, sitio inactivo). Defer permanente.
> - 🟡 **Vanuatu Daily Post** — IP-rate-limit 429, prioridad baja, RNZ Pacific cubre la región. Aceptar gap.
>
> **Total B17**: 5 feeds nuevos LIVE (4 MENA + BOE), 1 high-score real (Algeria), 81 rows primer ciclo. 4 items "rotos" del saneado ya estaban resueltos por trabajo previo (FXStreet, FundsForNGOs) o ahora vía workaround GN site search (BOE, MENA). Solo 2 items quedan abandonados conscientemente (Mideastwire, Vanuatu).
>
> **── B13 Crawl4AI sidecar (additive) PIVOT a trafilatura ──**
>
> Imagen oficial Crawl4AI 4-6GB (Playwright + chromium) no cabe en sda 99%/551MB free pre-cleanup. Pivot a `trafilatura` (academic state-of-the-art HTML→article extractor per Bevendorff et al. 2023) en sidecar `ultra_extract`:
> - python:3.12-slim + httpx + trafilatura 1.12.2 = 350MB total image
> - Endpoint POST /extract → {title, text, author, date, lang, sitename, categories, tags, text_length}
> - Memory limit 256M, port 127.0.0.1:8014:8000
> - **ADDITIVE**: NO toca rss.js. Engine integration en fallback path queda **pendiente para próxima sesión P1** — wire en `_parseUrlWithPuppeteerFallback` cuando puppeteer fallback retorne "no rss markers".
> - Validado E2E con artículo real Hellenic Shipping News: 3469 chars limpios + title + author extraídos.
> - Disk cleanup pre-build: `docker builder prune -f` liberó 1.7GB. sda 36G→34G used.
>
> **Lección**: BACKLOG.md contiene marks 🔴 obsoletos que no se actualizaron cuando el código se escribió. La verificación tier-by-tier con DB + grep + curl es obligatoria antes de planificar trabajo.
>
> **Bloqueados externamente (esperando aprobación/credenciales):**
> - Reddit PRAW (B10): OAuth client signup pendiente
> - Metaculus aggregation_explorer (B11): email a `support@metaculus.com` pendiente
> - ACLED (B12): cuenta `ibraboutereg@gmail.com` autentica OK pero `/api/acled/read` → 403. Necesita aprobación de `access@acleddata.com`. OAuth+cookie ambos verificados 2026-04-11.
> - EventRegistry / NewsAPI.ai: necesita email empresa
> - PodcastIndex: necesita email empresa

### News APIs — Tier 1 (free best)
| Item | Status | Cat | Notes |
|---|---|---|---|
| Currents API (1k req/day, 70+ countries) | 🟡 | (D) | stub `news_apis.js fetchCurrents()`, needs `CURRENTS_API_KEY` |
| Newsdata.io (200 credits/day, 206 countries, 89 langs) | 🟡 | (D) | stub `fetchNewsdata()`, needs `NEWSDATA_API_KEY` |
| NewsAPI.ai / Event Registry (2K searches/mo, 150K sources) | 🔴 | (D) | needs `EVENT_REGISTRY_API_KEY` |
| Finlight.me (10K req/mo, financial focus) | 🟡 | (D) | stub `fetchFinlight()`, needs `FINLIGHT_API_KEY` |

### News APIs — Tier 2/3
| Item | Status | Cat | Notes |
|---|---|---|---|
| TheNewsAPI (100 req/day) | 🔴 | (C) | low-priority |
| GNews API (100 req/day, 22 langs) | 🔴 | (C) | low-priority |
| WorldNewsAPI (50 pts/day, front pages) | 🔴 | (C) | unique feature: front pages 6K publications |
| Mediastack (100/MONTH free) | 🔴 | (C) | unusable free tier |
| Perigon News API (150/mo free) | 🔴 | (D) | paid for production |
| Newscatcher v3 (PAYG) | 🔴 | (D) | flexible pricing |
| NewsAPI.org (100/day, 55 countries) | 🔴 | (C) | docs explicitly say AVOID |

### News APIs — Tier 4 free/open
| Item | Status | Cat | Notes |
|---|---|---|---|
| GDELT DOC 2.0 | ✅ | — | `news_apis.js fetchGdelt()`, scheduler 2h |
| GDELT GEO 2.0 (location mapping) | 🔴 | (C) | spatial filtering not yet needed |
| GDELT TV 2.0 (9yr Internet Archive) | 🔴 | (C) | video out-of-scope |
| GDELT Context 2.0 (related topics) | 🔴 | (C) | topic expansion |
| GDELT CAST (conflict forecasting AUC 86-94%) | 🔴 | **(A)** | early_warning.js but not wired to scheduler |
| Google News RSS | 🔴 | (C) | fragile per docs |
| Bing News (decommissioned Aug 2025) | 🔴 | DEAD | — |

### News crawlers / scrapers
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Crawl4AI** (50K⭐, LLM-ready) | 🔴 | **(C)** | superior for non-RSS sites |
| **news-please** (1.8K⭐, CommonCrawl) | 🔴 | (B) | could replace `rss.js` parser logic |
| **Fundus** (flair NLP, high precision) | 🔴 | (B) | best accuracy per publisher |
| Newspaper4k (newspaper3k successor) | 🔴 | (B) | versatile articles |
| RSS-Bridge (7K⭐, generates RSS for non-feed sites) | 🔴 | **(A)** | augments manual feed list |

### Self-hosted aggregators
| Item | Status | Cat | Notes |
|---|---|---|---|
| **OSINT Monitor** (379 feeds + tier system + propaganda registry) | 🟡 | **(A)** | only 25/379 ports (6.6%) — Tier S #3 |
| NewsBlur (6.8K⭐, full-featured) | 🔴 | (C) | Miniflux alt |
| Fusion (Go+SQLite lightweight) | 🔴 | (C) | — |
| Glean (smart reading) | 🔴 | (C) | — |
| Yarr (2.8K⭐, single binary) | 🔴 | (C) | — |
| **Kill the Newsletter** (email→Atom/RSS) | 🔴 | **(A)** | self-hostable |

### NLP — Summarization
| Item | Status | Cat | Notes |
|---|---|---|---|
| **TextRank/LexRank** (graph-based extractive) | ✅ | — | `nlp.js summarize()` pure JS |
| BERT Extractive Summarizer | 🔴 | (C) | alternative |
| **PEGASUS** (best ROUGE for news ~45%) | 🔴 | (C) | needs HF container |
| BART (facebook/bart-large-cnn) | 🔴 | (C) | abstractive |
| T5 / FLAN-T5 | 🔴 | (C) | multi-task |
| LED (Longformer) | 🔴 | (C) | long documents |
| LLMs Llama 3 / Mistral / Qwen | 🔴 | (C) | expensive |

### NLP — Sentiment
| Item | Status | Cat | Notes |
|---|---|---|---|
| **AFINN-165** (Nielsen 2011) | ✅ | — | `nlp.js` ~360 EN+ES words |
| VADER (rule-based, social) | 🔴 | (C) | alternative |
| TextBlob (simple polarity) | 🔴 | (C) | simple |
| twitter-roberta-base-sentiment | 🔴 | (C) | neural |
| bert-multilingual-sentiment | 🔴 | (C) | 1-5 stars multi |
| **ProsusAI/finbert** (financial) | 🔴 | (C) | financial domain |
| NewsFeel (GPT-3.5) | 🔴 | (C) | cloud |
| **npm `afinn` / `sentiment`** | 🔴 | (B) | replace embedded lexicon |

### NLP — Fake news / Topic / NER / Translation
| Item | Status | Cat | Notes |
|---|---|---|---|
| GNN-FakeNews | 🔴 | (C) | needs training data + GPU |
| FakeNewsNet | 🔴 | (C) | benchmark |
| AraBERT + XGBoost (Arabic, F1 96%+) | 🔴 | (C) | Arabic-specific |
| bart-large-mnli (zero-shot) | 🔴 | **(C)** | high value, no training |
| BERTopic (topic modeling+temporal) | 🔴 | (C) | dynamic discovery |
| Top2Vec (auto topic) | 🔴 | (C) | embeddings |
| SetFit (few-shot 8-16 examples) | 🔴 | (C) | quick training |
| **spaCy** (75+ langs, 18 entity types) | 🔴 | **(A)** | robust baseline NER |
| Flair NLP (stacked embeddings) | 🔴 | (C) | better accuracy |
| Stanza Stanford NER | 🔴 | (C) | academic |
| GLiNER (zero-shot any entity) | 🔴 | (C) | flexible |
| **NER lite custom JS** | ✅ | — | `nlp.js extractCountries/Currencies/Money/People` |
| Helsinki-NLP/OPUS-MT (1K+ pairs) | 🔴 | (C) | needed for cross-lingual dedup |
| Meta NLLB (200+ langs) | 🔴 | (C) | low-resource |
| mBART-50 | 🔴 | (C) | news-tuned |
| GemmaX2-28 | 🔴 | (C) | tier-1 2025 |
| Qwen3-235B (100+ langs) | 🔴 | (C) | overkill |
| OpenNMT (self-hosted) | 🔴 | (C) | custom training |

### NLP — Dedup
| Item | Status | Cat | Notes |
|---|---|---|---|
| Jaccard (legacy) | 🟡 | — | used in `rss.js` |
| **MinHash+LSH datasketch (Python)** | 🟡 | (B) | reimplemented as `minhash.js` 196 LOC pure JS |
| Sentence-BERT (semantic verify) | 🔴 | (C) | could enhance MinHash post-filter |
| Multilingual Sentence-BERT | 🔴 | (C) | cross-language dedup |
| SemHash 2025 (semantic fast) | 🔴 | (C) | newer alternative |

### Social media
| Item | Status | Cat | Notes |
|---|---|---|---|
| Bluesky search (xrpc) | ✅ | — | `news_apis.js fetchBlueskySearch()` |
| **Bluesky firehose Jetstream** (WebSocket) | 🔴 | (C) | full real-time stream |
| Reddit API (free <100 q/min, PRAW) | 🔴 | (C) | r/worldnews, country subs |
| Pushshift (billions posts since 2005) | 🔴 | (C) | historical |
| **Mastodon API** (free, RSS native) | 🔴 | **(A)** | RSS per profile |
| mastodon.py wrapper | 🔴 | (C) | — |
| **Telegram via Telethon** (channel monitoring) | 🔴 | (C) | requires whitelist |
| Pyrogram (alt) | 🔴 | (C) | — |
| **YouTube Data API v3** (10K units/day, RSS native) | 🔴 | **(A)** | per-channel RSS endpoint |
| yt-dlp (metadata) | 🔴 | (C) | — |
| Invidious (RSS frontend) | 🔴 | (C) | — |
| Twitter/X Nitter | 🔴 | DEAD | docs say AVOID |

### Early warning feeds
| Item | Status | Cat | Notes |
|---|---|---|---|
| GDELT (already covered) | ✅ | — | — |
| **ACLED** (200+ countries since 1997) | 🟡 | (D) | requires researcher registration |
| USGS Earthquakes | ✅ | — | `early_warning.js fetchUSGSEarthquakes()` |
| **WHO Disease Outbreak News** | 🟡 | **(A)** | stub `fetchWHODons()` needs completion |
| **ReliefWeb API** (1980s-present) | 🔴 | (D) | Hetzner IP blocked as bot |
| **NOAA Weather Alerts** (JSON) | ✅ | — | `early_warning.js fetchNOAA()` 50 inserted |
| **GDACS** (6min update floods/cyclones/fires) | 🔴 | **(A)** | RSS free no-auth |
| **ProMED** (disease outbreaks) | 🔴 | **(A)** | RSS free |
| **International Crisis Group** | 🔴 | **(A)** | RSS free |
| **FEWS NET** (food security Africa) | 🔴 | **(A)** | RSS free |
| **US State Dept Travel Advisories** | 🔴 | **(A)** | RSS free |
| **Australian Smartraveller** | 🔴 | **(A)** | API free |
| **CDC Outbreaks RSS** | 🔴 | **(A)** | free |
| **MAEC España** (travel advisories) | 🔴 | **(A)** | scraper, gov ES |

### Podcasts / Newsletters
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Podcast Index API** (free, no auth, millions) | 🔴 | **(A)** | search/episodes/categories |
| Listen Notes API (300/mo free) | 🔴 | (D) | very limited free |
| **Apple Podcasts Search** | 🔴 | **(A)** | itunes.apple.com/search free |
| YouTube RSS news channels | 🔴 | (C) | covered above |

### Country / regional sources (non-implemented)
**Status global:** 23/193 countries seed (12%). 5 reposicionados via Fase 3a (Khaleej Times AE, Le Temps CH, The Journal IE, La Tercera CL, Hankyoreh KR). 168 países sin coverage.

| Region | Sources documented | Status |
|---|---|---|
| Pacific Islands | RNZ Pacific (seeded), PINA, Pacific Islands Report, Pacific Island Times, Tuvalu/Nauru/Palau individuals (8) | 🔴 1/12 |
| Small African states | AllAfrica per-country (Eswatini/Comoros/STP/Eq.Guinea), individual Tuvalu/Matangi Tonga | 🔴 0/10 |
| Central Asia | Times of Central Asia, Eurasianet, RFE/RL Turkmen+Tajik | 🔴 0/3 |
| Caribbean | WIC News, Loop Caribbean, Caribbean360, individual territories (6) | 🔴 0/9 |
| MENA | MENAFN, Middle East Eye, Mideastwire (22 country translations) | 🔴 0/3 |
| Africa | The Africa Report, AllAfrica per-country | 🔴 0/2 |
| Arctic/Nordic | Arctic Today, Barents Observer | 🔴 0/2 |
| Balkans | Balkan Insight (BIRN), SeeNews | 🔴 0/2 |
| Central America | Central America News.Net, **Adam Isacson OPML (140+ feeds)** | 🔴 **(A)** Tier S #5 |
| LatAm general | Global Voices, EIN Presswire per-nation | 🔴 0/2 |
| Multilingual ES | Agencia EFE, Europa Press, elDiario.es, France 24 ES | 🔴 0/4 |
| Multilingual AR | Al Arabiya EN, Al Jazeera, The New Arab, Mideastwire daily | 🔴 0/4 |
| Multilingual FR | **Jeune Afrique**, RFI Afrique, France 24 Afrique | 🔴 0/3 |
| Multilingual PT | Lusa News Agency, Agencia Brasil | 🔴 0/2 |

### Cross-pillar specialized (mentioned in P1 docs but route to other pillars)
| Item | Routes to | Status |
|---|---|---|
| Layoffs.fyi, TrueUp, SkillSyncer, Crunchbase News, Rest of World, Challenger Report | P2 | 🔴 |
| Atlantic Council Crypto Tracker, CryptoSlate Reg, CoinDesk Policy, DL News, CentralBanking RSS, ForexNewsAPI, FXStreet, regulatory-pulse | P3 | 🔴 |
| VisaGuide.News, WorkPermit, DN Visa Index, visa-digital-nomad, Henley Passport Index, USCIS RSS | P4 | 🔴 |
| GrantWatch, ProFellow, FundsForNGOs, ICTworks, Arch Grants | P5 | 🔴 |

---

## PILLAR 2 — EMPLOYMENT

**Coverage real:** 16% (28 of 180 investigated)
**Best balanced.** Adopted JobSpy correctly. But missing maritime (user's primary sector!), 95+ Workday tenants, 9 visa sponsor countries.

### ATS APIs — Tier 1 (free, no auth)
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Greenhouse** | ✅ | — | `job_apis.js fetchGreenhouse()` 4+ companies |
| **Lever** | ✅ | — | `job_apis.js fetchLever()` 4+ companies |
| **Ashby** | ✅ | — | `job_apis.js fetchAshby()` 3+ companies |
| **SmartRecruiters** | ✅ | — | `job_apis.js fetchSmartRecruiters()` 3+ companies |

### Workday tenants (5/100+ implemented)
| Tenant | Status | Cat | Notes |
|---|---|---|---|
| Salesforce (External_Career_Site/wd12) | ✅ | — | 1451+ jobs |
| NVIDIA (nvidiaexternalcareersite/wd5) | ✅ | — | 2000+ jobs |
| Accenture (AccentureCareers/wd103) | ✅ | — | 2000+ jobs |
| PwC (Global_Experienced_Careers/wd3) | ✅ | — | 5055+ jobs |
| Pfizer (PfizerCareers/wd1) | ✅ | — | 574+ jobs |
| **BHP** (mining) | ✅ | — | careers.bhp.com HTML (NO es Workday). `p2_deep_jobs.fetchBHP` |
| **Maersk** (maritime) | ✅ | — | workday.js `Maersk_Careers` (760 jobs) |
| **FedEx** | ✅ | — | workday.js `FXE-LAC_External_Career_Site` (139 jobs) |
| **Royal Caribbean** (cruise) | ✅ | — | jobs.royalcaribbeangroup.com SuccessFactors (NO Workday). `p2_deep_jobs.fetchRCG` |
| **Wilhelmsen** (maritime) | ✅ | — | workday.js |
| **Equinor** (offshore oil) | ✅ | — | workday.js `EQNR` |
| **DP World** (ports) | ✅ | — | Oracle HCM public REST /hcmRestApi (528 jobs). `p2_deep_jobs.fetchDPWorld` |
| **Amazon** (Workday-derived) | 🔴 | **(A)** | tech |
| ~92 more enterprise Workday tenants | 🔴 | (A/C) | research line: ~100+ possible |

### Government job portals
| Item | Status | Cat | Notes |
|---|---|---|---|
| **USAJobs** (gov ES email + key) | 🟡 | (D) | `gov_jobs.js fetchUSAJobs()` stub |
| **JobTech SE** (Sweden, free) | ✅ | — | `gov_jobs.js fetchJobTechSE()` |
| **hh.ru** (Russia, free) | ✅ | — | `gov_jobs.js fetchHHru()` |
| **NAV Norway** (deprecated public, new requires reg) | 🟡 | (D) | stub `fetchNAV()` |
| **Bundesagentur DE** (X-API-Key) | 🟡 | (D) | stub `fetchBundesagentur()` |
| **France Travail** (OAuth) | 🟡 | (D) | stub `fetchFranceTravail()` |
| **Job Bank Canada** (XML free) | 🔴 | **(A)** | LMIA visa context |
| **EURES** (REST free, 28 EU countries) | 🔴 | **(A)** | EU work visa |
| **Trade Me NZ** (OAuth) | 🔴 | (D) | NZ #1 jobs |
| **InfoJobs ES** (OAuth) | 🔴 | (D) | Spain #1 jobs |
| **SEEK Australia** | 🔴 | (D) | partially via JobSpy |
| **Reed UK** | 🔴 | (C) | Tier 1 free |

### JobSpy ecosystem
| Item | Status | Cat | Notes |
|---|---|---|---|
| **JobSpy sidecar** (LinkedIn/Indeed/Glassdoor/Bayt/Naukri) | ✅ | — | docker `jobspy:8000`, `gov_jobs.js fetchJobSpyOnsite()` |
| rainmanjam/jobspy-api (349⭐, dockerized auth+rate limit) | 🔴 | (B) | research recommended; use plain instead |
| spinlud/py-linkedin-jobs-scraper (468⭐) | 🔴 | (C) | dedicated LinkedIn |
| spinlud/linkedin-jobs-scraper (180⭐ TS) | 🔴 | (C) | Node native |
| ts-jobspy (9⭐ TS) | 🔴 | (C) | TS port |
| DaKheera47/jobspy-node (2⭐) | 🔴 | (C) | Node port |
| rynobax/indeed-scraper (54⭐) | 🔴 | (C) | dedicated Indeed |
| llorenspujol/linkedin-jobs-scraper (74⭐) | 🔴 | (C) | Puppeteer |
| **PaulMcInnis/JobFunnel** (2.1K⭐, dedup) | 🔴 | (C) | dedup reference |
| Feashliaa/job-board-aggregator (22⭐, 500K+ jobs from Greenhouse/Lever/Ashby/Workday) | 🔴 | (B) | could replace job_apis.js |
| christopherlam888/workday-scraper (17⭐ Python) | 🔴 | (B) | reference for workday.js |

### Sector-specific — MARITIME (user's primary sector! 0% coverage)
| Item | Status | Cat | Notes |
|---|---|---|---|
| **CrewBay** (crewbay.com) | ✅ | — | `maritime_jobs.fetchCrewBay` HTTP simple |
| **AllCruiseJobs** | ✅ | — | `maritime.js` puppeteer + `maritime_jobs.fetchAllCruiseJobs` HTTP fallback |
| **SeaJobs** | ❌ | — | Dominio parked (Parklogic redirect, verificado 2026-04-14) |
| **Martide** | 🔴 | (C) | crew portal |
| **Crewlinker** | 🔴 | (C) | crew portal |

### Sector-specific — Mining/FIFO/Oil
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Rigzone** (RSS rigzone.com/news/rss.asp) | 🔴 | **(A)** | oil/gas RSS |
| FIFOjobs | 🔴 | (C) | custom scraper needed |
| Energy Job Shop | 🔴 | (C) | custom scraper |
| OilJobFinder | 🔴 | (C) | custom scraper |
| SEEK Mining | 🔴 | (C) | covered via JobSpy AU keyword |

### MENA platforms
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Bayt** (40K employers Gulf) | 🟡 | — | via JobSpy multi-site only |
| Mostaql (premium freelance MENA) | 🔴 | (C) | no API, scraping needed |
| Khamsat (Arabic Fiverr) | 🔴 | (C) | no API |
| Ureed (translation/tech MENA) | 🔴 | (C) | no API |

### LatAm platforms
| Item | Status | Cat | Notes |
|---|---|---|---|
| **GetOnBoard** (CL/CO/MX/PE tech, public API) | ✅ | — | `latam_jobs.js` (8 cats, 137 onsite jobs) |
| **Torre.ai** (AI recruitment, MCP server) | ✅ | — | `p2_deep_jobs.fetchTorre` REST (164K opps, ~80% remote→P5) |
| Workana | 🔴 | (C) | scraper |

### Premium freelance (P5 routing — not P2)
| Item | Status | Cat | Notes |
|---|---|---|---|
| Upwork (OAuth) | 🔴 | (D) | slow approval |
| Toptal | 🔴 | (D) | manual application |
| Turing | 🔴 | (D) | vetting |
| Arc.dev | 🔴 | (D) | vetting |
| Lemon | 🔴 | (D) | EEU/LatAm vetting |
| Gun.io | 🔴 | (D) | senior-only |
| X-Team | 🔴 | (D) | culture vetting |
| Andela | 🔴 | (D) | Africa vetting |
| BrainTrust | 🔴 | (D) | Web3/DAO vetting |
| Codeable | 🔴 | (D) | WordPress |

### Visa sponsorship databases
| Item | Status | Cat | Notes |
|---|---|---|---|
| **UK Sponsor Register** CSV | ✅ | — | `gov_jobs.js importUKSponsorRegister()` |
| **SiaExplains/visa-sponsorship-companies** (534⭐, 50+ countries TS) | 🔴 | **(A)** | 9+ countries to add |
| **geshan/au-companies-providing-work-visa-sponsorship** (1,843⭐) | 🔴 | **(A)** | AU sponsors |
| **Lamiiine/Awesome-daily-list-of-visa-sponsored-jobs** (612⭐) | 🔴 | (C) | daily list |
| **renatoaraujo/uk-visa-sponsors** (7⭐) | 🔴 | (B) | CLI tool |
| **oussamabouchikhi/companies-sponsoring-visas-netherlands** (14⭐) | 🔴 | (A) | NL IND sponsors |
| **Canada LMIA** | 🔴 | **(A)** | TN visa context |
| **USA H-1B Hub** | 🔴 | (C) | H-1B history |

### Ancillary
| Item | Status | Cat | Notes |
|---|---|---|---|
| zackharley/cost-of-living-api (27⭐) | 🔴 | (C) | salary-adjusted scoring |
| numbeo-scraper | 🔴 | (D) | $50-500/mo paid |
| glassdoor-scraper (71⭐ Python) | 🔴 | (C) | Glassdoor IP-blocked |
| Adzuna API | 🟡 | — | legacy `scraper.js` (NZ only) |

---

## PILLAR 3 — FINANCE

**Coverage real:** 19% (24 of 127). **The Firefly III dilemma.** Documented decision was "custom + FF3 inspiration" but the cost/benefit was rebellion against 28K⭐ mature platform.

### Self-hosted ledgers
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Firefly III** (28K⭐) | 🟡 | (B) | doc: "custom + FF3 inspiration" — schema concepts only, NOT adopted as primary |
| **Actual Budget** (25.8K⭐) | 🟡 | (B) | schema insights only (envelope, imported_id dedup) |
| Beancount + fava (2.4K+463⭐) | 🔴 | (B) | double-entry not adopted |
| Ledger CLI / ledger-cli | 🔴 | (B) | — |
| **Maybe Finance** | 🟡 | — | daily NW snapshots model used |
| Buckwheat | 🔴 | (B) | — |
| Manager (ERPNext-style) | 🔴 | (B) | — |
| Akaunting | 🔴 | (B) | — |

### Investment trackers
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Ghostfolio** | 🟡 | (B) | metrics referenced; custom investments.js used instead |
| Portfolio Performance | 🔴 | (B) | — |

### Crypto trackers / tax tools
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Rotki** (3.7K⭐ AGPL DeFi P&L+tax) | 🔴 | (C) | AGPL complex integration |
| CoinTracking | 🔴 | (D) | paid |
| **Koinly** ($49-299/yr, 100+ exchanges, 7K DeFi, Modelo 721) | 🔴 | (D) | docs RECOMMENDED, user must subscribe |
| **BittyTax** (490⭐ UK HMRC) | 🔴 | (C) | open source |
| RP2 / dali-rp2 (380⭐/78⭐, multi-country FIFO/LIFO/HIFO) | 🔴 | (C) | open source |
| **CCXT** (41K⭐, 107+ exchanges) | 🟡 | (D) | only Binance stub via `crypto.js`, needs `BINANCE_API_KEY` |
| **CoinGecko** (free) | ✅ | — | `crypto.js fetchPrices()` 20 tickers |

### Banking aggregators
| Item | Status | Cat | Notes |
|---|---|---|---|
| **GoCardless Bank Account Data** (ex-Nordigen, 31 countries, 2,300+ banks) | 🔴 | **(A)** | KEYSTONE per docs, Phase 2 deferred |
| **Akahu** (NZ #1, free dev tier, 50+ NZ banks) | 🟡 | (D) | `akahu.js` stub, needs `AKAHU_USER_TOKEN+AKAHU_APP_TOKEN` |
| Plaid (US/CA, 100 free) | 🔴 | (D) | sandbox only |
| Tink (Visa, 18 EU, 6K banks) | 🔴 | (D) | sandbox only |
| Yapily (UK+EU, 1.8K banks) | 🔴 | (D) | sandbox only |
| TrueLayer (UK→EU) | 🔴 | (D) | sandbox only |

### Bank CSV parsers (NZ)
| Bank | Status | Notes |
|---|---|---|
| **ASB** | ✅ | `bank_csv.js profile.asb` |
| **ANZ** | ✅ | `profile.anz` |
| **Westpac** | ✅ | `profile.westpac` |
| **BNZ** | ✅ | `profile.bnz` |
| **Kiwibank** | ✅ | `profile.kiwibank` (DD-MM-YYYY) |

### EU banks (would need GoCardless aggregator)
| Bank | Status | Notes |
|---|---|---|
| BBVA | 🔴 | bbvaapimarket.com exists, would need GoCardless |
| Santander | 🔴 | developer.santander.com PSD2 |
| CaixaBank | 🔴 | needs GoCardless |
| Sabadell | 🔴 | needs GoCardless |
| ING Spain, Openbank, Bankinter, N26 | 🔴 | all needs GoCardless |

### FX / Stock APIs
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Frankfurter** (ECB, free) | ✅ | — | `fx.js` PRIMARY |
| **fawazahmed0/exchange-api** (CDN, 200+) | ✅ | — | `fx.js` FALLBACK |
| ECB SDMX | 🔴 | (B) | Frankfurter wraps it |
| **Stooq.com** (free CSV stocks) | ✅ | — | `investments.js` |
| yfinance | 🔴 | (C) | gray ToS |
| Alpha Vantage (25/day free) | 🔴 | (D) | limited |
| OpenBB (65K⭐) | 🔴 | (C) | too heavy |
| RBNZ (R package) | 🔴 | (C) | not needed |

### Tax tools
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Modelo 720** (ES bienes extranjero) | ✅ | — | `tax_reporting.js generateModelo720()` |
| **Modelo 721** (ES crypto) | ✅ | — | `tax_reporting.js generateModelo721()` |
| **Modelo 100** (ES IRPF) | ✅ | — | `tax_reporting.js generateModelo100()` |
| **PAYE NZ** (1 Apr - 31 Mar) | 🔴 | **(A)** | hardcode thresholds |
| **Spanish residency counter** (183 days) | ✅ | — | `tax_reporting.js computeResidencyES()` |
| **AU tax** (DASP, BAS) | 🔴 | (C) | not needed yet |
| **FIF calculator NZ** | 🔴 | (C) | foreign investment funds |
| Beckham Law estimator (ES inpat regime) | 🔴 | (C) | — |

### Recurring detection
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Custom interval-based + confidence** | ✅ | — | `recurring.js` (~160 LOC) |
| SQL LAG window | 🔴 | (C) | mentioned alt |
| ML clustering (datasketch) | 🔴 | (C) | too complex |
| Actual Budget rules engine | 🔴 | (B) | learn-from-3-manual model |

### Receipt OCR
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Paperless-ngx** (37.8K⭐) | 🟡 | — | deployed for P4, NOT exposed as P3 receipt OCR |
| Tesseract.js | 🟡 | — | container has it, NOT P3 receipt endpoint |

### Investments features researched
| Feature | Status | Cat |
|---|---|---|
| Live quote fetching | ✅ | `investments.js getQuote()` |
| Portfolio valuation | ✅ | `getPortfolio()` |
| TWR / MWR | 🔴 | (C) |
| Risk metrics (Sharpe/Sortino) | 🔴 | (C) |
| Performance ranges (WTD/MTD/YTD/1Y/5Y/Max) | 🔴 | (C) |

### DeFi (Rotki domain)
| Feature | Status | Cat |
|---|---|---|
| Aave/Compound/Uniswap LP P&L | 🔴 | (C) |
| NFT tracking | 🔴 | (C) |
| Staking rewards | 🔴 | (C) |
| DEX trade tax reports | 🔴 | (C) |

---

## PILLAR 4 — BUREAUCRACY

**Coverage real:** 9% (6 of 68). Architecturally OK (Paperless+changedetection adopted) but seed data missing massively.

### Document management
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Paperless-ngx** (37.8K⭐) | ✅ | — | container `ultra_paperless`, `paperless.js` REST client |
| **paperless-ai** (5.5K⭐ auto-classify) | 🔴 | (D) | needs OPENAI_API_KEY or Ollama |
| **paperless-gpt** (2.2K⭐ LLM Vision) | 🔴 | (C) | passport recognition |
| paperless-mobile (1.3K⭐) | 🔴 | (C) | mobile scan |
| Swift-paperless (880⭐ iOS) | 🔴 | (C) | iOS native |
| paperless-mcp (154⭐ Claude integration) | 🔴 | (C) | AI direct |
| paperless-ngx-postprocessor (155⭐) | 🔴 | (C) | hooks |
| **Tesseract.js** | ✅ | — | `ocr.js` |
| **Stirling-PDF** (76.3K⭐) | 🔴 | (C) | #1 PDF tool |
| Mayan EDMS | 🔴 | (B) | DMS alt |
| DocSpell | 🔴 | (B) | DMS alt |
| **surya** (19.5K⭐ layout-aware OCR 90+ langs) | 🔴 | (C) | passport ideal |
| MinerU (58.2K⭐ PDF→md/JSON) | 🔴 | (C) | — |
| OCRmyPDF (33.1K⭐) | 🔴 | (C) | — |
| llm_aided_ocr (2.9K⭐) | 🔴 | (C) | LLM-improved Tesseract |
| MarkItDown Microsoft (93.3K⭐) | 🔴 | (C) | — |

### Visa & passport data
| Item | Status | Cat | Notes |
|---|---|---|---|
| **passport-index-dataset** (301⭐ ilyankou, 199 países CSV) | 🟡 | **(A)** | only 188 manual hardcoded — Tier S #4 |
| passport-index-data (51⭐ alt format) | 🔴 | (B) | similar |
| passport-visa-api (43⭐ REST wrapper) | 🔴 | (C) | — |
| visa-req-wiki-scraper (16⭐) | 🔴 | (C) | — |
| visa-cli (23⭐) | 🔴 | (C) | — |
| visaverse (22⭐ 3D viz) | 🔴 | (C) | — |
| **Sherpa API** (200+ countries, 100 req/s, gold standard) | 🔴 | (D) | paid |
| **Travel Buddy API** (RapidAPI, 120-200/mo free) | 🔴 | (D) | $4.99/mo |
| **VisaDB API** (200+ countries, monitors 700+ gov sites) | 🔴 | (D) | paid |
| **IATA Travel Centre** | 🔴 | (C) | official IATA |

### Schengen calculator
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Custom JS implementation** (passport-aware ES freedom) | ✅ | — | `schengen.js` |
| EU Commission official calc | 🟡 | — | reference, our impl matches |
| schengencalc npm (adambard) | 🔴 | (B) | could replace 120 LOC |

### Web monitoring
| Item | Status | Cat | Notes |
|---|---|---|---|
| **changedetection.io** (31K⭐) | ✅ | — | container `ultra_changedetection`, `changedetection.js` client |
| **Huginn** (49K⭐) | 🔴 | (B) | agent-based alt |
| Home Assistant (86K⭐) | 🔴 | (C) | multi-channel notif |
| urlwatch | 🔴 | (B) | inferior |
| RSS-Bridge | 🔴 | (C) | covered in P1 |
| FreshRSS | 🔴 | (C) | RSS aggregator |
| Fluxguard / Distill / Sniff | 🔴 | (B) | proprietary alts |

### Workflow automation
| Item | Status | Cat | Notes |
|---|---|---|---|
| **n8n** (182.6K⭐) | 🔴 | **(A)** | research recommended for cron+notifications |
| Huginn (49K⭐) | 🔴 | (B) | covered above |
| Node-RED | 🔴 | (C) | — |
| Zapier | 🔴 | (D) | commercial |

### Notifications
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Apprise** (multi-channel) | 🟡 | (C) | URL format used for cdio webhooks only |
| Gotify | 🔴 | (C) | notification server |
| ntfy | 🔴 | (C) | lightweight |
| **Telegram bot** (custom) | ✅ | — | `telegram.js` |

### Calendar
| Item | Status | Cat | Notes |
|---|---|---|---|
| **CalDAV** (iCal export) | 🔴 | **(A)** | Google/Outlook sync |
| Radicale CalDAV server | 🔴 | (C) | — |
| Google Calendar API / ICS | 🔴 | **(A)** | direct sync |

### Tax deadline data (per country)
| Country | Status | Notes |
|---|---|---|
| ES Modelo 720/721/100/210 (AEAT BOE) | 🟡 | structure exists, manual seed only |
| NZ IRD Number / FIF | 🟡 | not seeded |
| AU TFN / DASP / Medicare | 🟡 | not seeded |
| US IRS / FBAR | 🔴 | not relevant yet |

### Crypto tax
| Item | Status | Cat | Notes |
|---|---|---|---|
| BittyTax (491⭐) | 🔴 | (C) | covered in P3 |
| Koinly | 🔴 | (D) | covered in P3 |

### Embassy directories
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Custom 11 seed** (ES+DZ priority) | ✅ | — | `bur_embassies` table |
| Wikipedia Embassies scraper | 🔴 | (A) | dynamic updates |
| gov.uk MOFA | 🔴 | (A) | UK FCO data |
| Project EU consulates | 🔴 | (A) | EU dataset |
| Henley Passport Index 2026 | 🔴 | (C) | could feed visa matrix |

### Civil registry / legal
| Item | Status | Cat | Notes |
|---|---|---|---|
| Apostille tracking (Hague Convention 67 countries) | 🔴 | (C) | 10yr expiry |
| Driver license per country (NZ NZTA, AU Austroads, ES DGT) | 🔴 | (C) | renewal alerts |
| **Military service obligations Algeria** (Certificat Position Militaire, age 27-30) | 🔴 | (C) | DZ-specific user |

### Regulatory frameworks
| Item | Status | Cat | Notes |
|---|---|---|---|
| **DAC8** (EU crypto reporting 2026) | 🔴 | (C) | takes effect 2026 |
| MiCA (EU markets crypto) | 🔴 | (C) | — |
| FATCA (US) | 🔴 | (C) | — |
| CRS (OECD CRS) | 🔴 | (C) | — |
| GDPR | 🔴 | (C) | doc storage relevance |
| **CDI España-NZ** (BOE-A-2006-17741) | 🟡 | — | researched, not auto-tracked |
| **CDI España-AU** | 🟡 | — | researched |
| **CDI España-Algeria** (BOE-A-2005-13382) | 🟡 | — | researched |
| **NO CDI Algeria-NZ** (double-tax risk!) | 🔴 | (C) | should flag for user |

---

## PILLAR 5 — OPPORTUNITIES

**Coverage real:** 7% (14 of 200+). Categorías enteras vacías: tech writing, AI training, premium freelance, scholarships.

### Remote job aggregators
| Item | Status | Cat | Notes |
|---|---|---|---|
| **RemoteOK** | ✅ | — | `opp_fetchers.js fetchRemoteOk()` |
| **Remotive** | ✅ | — | `fetchRemotive()` |
| **Himalayas** | ✅ | — | `fetchHimalayas()` |
| **Jobicy** | ✅ | — | `fetchJobicy()` |
| **HackerNews "who's hiring"** | ✅ | — | `fetchHnWhoIsHiring()` |
| **GitHub bounties** | ✅ | — | `fetchGithubBounties()` |
| **We Work Remotely** (RSS) | 🔴 | **(A)** | — |
| DailyRemote (RSS) | 🔴 | **(A)** | — |
| Nodesk (RSS, nomad) | 🔴 | (A) | — |
| JustRemote | 🔴 | (D) | no API |
| Remote.co | 🔴 | (D) | no API |
| FlexJobs | 🔴 | (D) | $10-25/mo |

### Premium freelance (vetting required)
| Item | Status | Cat | Notes |
|---|---|---|---|
| Upwork (OAuth slow approval) | 🔴 | (D) | — |
| **Freelancer.com** | 🟡 | (B) | `freelance_scraper.js` data NOT persisted to opportunities |
| Toptal | 🔴 | (D) | manual app |
| Gun.io | 🔴 | (D) | senior-only |
| Turing | 🔴 | (D) | — |
| Arc | 🔴 | (D) | — |
| Lemon | 🔴 | (D) | — |
| X-Team | 🔴 | (D) | — |
| Andela | 🔴 | (D) | — |
| BrainTrust | 🔴 | (D) | — |
| Codeable | 🔴 | (D) | WP |
| Fiverr | 🔴 | (A) | API exists |
| PeoplePerHour | 🔴 | (A) | UK |
| Guru | 🔴 | (A) | — |
| Malt | 🔴 | (A) | EU |
| Hired | 🔴 | (D) | — |
| Wellfound (AngelList) | 🔴 | (C) | startups |
| Otta | 🔴 | (D) | — |
| Cord | 🔴 | (C) | UK CTO |

### MENA platforms (user speaks Arabic)
| Item | Status | Cat | Notes |
|---|---|---|---|
| Mostaql ($15-40/h Arab freelance) | 🔴 | (C) | scraping |
| Khamsat (Arabic Fiverr) | 🔴 | (C) | scraping |
| Ureed ($15-50 trans/tech) | 🔴 | (C) | scraping |
| Bayt (40K+ Gulf employers) | 🟡 | — | partial via JobSpy |

### LatAm
| Item | Status | Cat | Notes |
|---|---|---|---|
| Workana (LatAm generalist) | 🔴 | (C) | scraping |
| **GetOnBoard** (CL/CO/MX/PE tech, public API) | 🔴 | **(A)** | — |
| **Torre.ai** (AI recruitment + MCP) | 🔴 | **(A)** | — |

### Bug bounties — traditional
| Item | Status | Cat | Notes |
|---|---|---|---|
| HackerOne | 🔴 | (D) | API needs token |
| Bugcrowd | 🔴 | (D) | — |
| **Intigriti** (RSS) | 🔴 | **(A)** | EU-strong |
| YesWeHack | 🔴 | (B) | scraping |
| Synack (invite) | 🔴 | (D) | — |
| Open Bug Bounty | 🔴 | (C) | reputation only |
| **Huntr** (OSS-specific) | 🔴 | **(A)** | OSS bounties |

### Bug bounties — crypto
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Immunefi** ($1K-$10M+) | ✅ | — | `opp_fetchers.js fetchImmunefi()` |
| **Code4rena** ($5K-$100K audits) | ✅ | — | `fetchCode4rena()` |
| Sherlock (DeFi contests) | 🔴 | (C) | — |
| Hats Finance (decentralized) | 🔴 | (C) | — |
| Spearbit (invite elite) | 🔴 | (D) | — |

### Hackathons
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Devpost** (JSON API) | ✅ | — | `fetchDevpost()` |
| **Codeforces** (API) | ✅ | — | `fetchCodeforces()` upcoming contests |
| **Unstop** (India hackathons + competitions JSON API) | ✅ | — | `fetchUnstop()` |
| **Lablab.ai** | 🟡 | — | listed in FETCHERS array, function may be missing |
| ETHGlobal ($50K-$500K, ~8/yr) | 🔴 | (A) | calendar scraping |
| MLH (weekly student) | 🔴 | (C) | — |
| HackathonIO (global aggregator) | 🔴 | (C) | — |
| Gitcoin Hackathons (Web3, $10K-$100K) | 🔴 | (C) | — |
| Chainlink Hackathons ($50K-$500K) | 🔴 | (C) | — |
| **Solana Hackathons (Colosseum)** ($100K-$1M, $5M+ historical) | 🔴 | **(A)** | high prize pools |
| HackerEarth | 🔴 | (D) | no API |
| Buildspace (6-week) | 🔴 | (C) | — |

### Algorithmic competitions
| Item | Status | Cat | Notes |
|---|---|---|---|
| Codeforces (already covered) | ✅ | — | — |
| TopCoder ($100-$25K) | 🔴 | (C) | — |
| Google Kickstart | 🔴 | (C) | recruitment |
| Meta Hacker Cup ($10K-$25K) | 🔴 | (C) | annual |
| Reply Code Challenge (€10K+) | 🔴 | (C) | EU teams |
| CodinGame | 🔴 | (C) | monthly |
| LeetCode Contests | 🔴 | (C) | LeetCoins |
| Advent of Code | 🔴 | (C) | December only |
| AtCoder (AHC cash) | 🔴 | (C) | Japanese |
| **CodeChef** ($10K+) | 🔴 | **(A)** | API works |
| **Kaggle** ($5K-$100K data science) | 🔴 | (A) | scraping |
| **clist.by** (programming contest aggregator API) | 🔴 | **(A)** | unified |
| **CTFtime** (CTF events RSS+API) | 🔴 | **(A)** | — |

### Government grants
| Item | Status | Cat | Notes |
|---|---|---|---|
| **BOE Ayudas** (ES gov subsidies RSS) | ✅ | — | `gov_grants.js fetchBOEAyudas()` |
| **CDTI** (NEOTEC, RSS) | ✅ | — | `fetchCDTI()` (some XML parse issues) |
| **ENISA** (loans 25K-1.5M, RSS) | ✅ | — | `fetchENISA()` (some XML parse issues) |
| **EU SEDIA Funding Portal** (POST API, 636K opps) | ✅ | — | `fetchEUSedia()` |
| **Acelera Pyme ES** | ✅ | — | `fetchAceleraPyme()` (HTTP 403 sometimes) |
| Garantía Juvenil ES (€80/mo) | 🔴 | (A) | gov program |
| Kit Digital ES (€2-3K) | 🔴 | (A) | digitization aid |
| **Horizon Europe** (€10K-€2.5M) | 🔴 | (A) | major 2026 |
| **EIC Accelerator** (€414M budget, €2.5M+) | 🔴 | (A) | major 2026 |
| EIC Pre-Accelerator (deep tech) | 🔴 | (C) | — |
| Digital Europe Programme | 🔴 | (C) | — |

### OSS-specific funding
| Item | Status | Cat | Notes |
|---|---|---|---|
| **NLnet** (€5K-€50K Atom) | ✅ | — | `fetchNLnet()` (verify export) |
| NGI Zero (€5K-€150K, part of NLnet) | 🟡 | — | covered via NLnet |
| Sovereign Tech Fund (€50K-€500K+) | 🔴 | (A) | German |
| Prototype Fund (€47.5K) | 🔴 | (D) | DE residency |
| GitHub Fund ($10M) | 🔴 | (A) | 8-10 cos/yr |
| GitHub Secure OSS ($1.25M) | 🔴 | (A) | security |
| FLOSS/Fund ($10K-$100K) | 🔴 | (A) | rolling |
| OpenSSF ($12.5M+) | 🔴 | (C) | foundation |

### Crypto/DeFi grants
| Item | Status | Cat | Notes |
|---|---|---|---|
| Ethereum Foundation ($5K-$500K) | 🔴 | (C) | no central API |
| Solana Foundation ($5K-$100K) | 🔴 | (C) | — |
| Polygon ($5K-$50K) | 🔴 | (C) | — |
| Gitcoin Grants (quadratic) | 🔴 | (C) | — |
| Chainlink ($5K-$100K) | 🔴 | (C) | — |
| Filecoin ($5K-$50K) | 🔴 | (C) | — |
| Protocol Labs ($10K-$200K) | 🔴 | (C) | — |
| Uniswap Foundation ($300K+, $115M committed) | 🔴 | (C) | — |
| Aave ($5K-$100K) | 🔴 | (C) | — |

### NZ/AU gov
| Item | Status | Cat | Notes |
|---|---|---|---|
| Callaghan/MBIE NZ | 🔴 | (D) | no API |
| business.gov.au AU | 🔴 | (D) | no API |
| Business Finland | 🔴 | (C) | — |
| Vinnova Sweden | 🔴 | (C) | — |

### Scholarships (EU citizens)
| Item | Status | Cat | Notes |
|---|---|---|---|
| Erasmus Mundus | 🔴 | (C) | — |
| Fulbright España | 🔴 | (C) | — |
| Becas La Caixa | 🔴 | (C) | — |
| DAAD Germany | 🔴 | (C) | — |
| Marie Skłodowska-Curie | 🔴 | (C) | — |
| EIT Digital Master | 🔴 | (C) | — |
| Swiss Government | 🔴 | (C) | — |
| Becas FPU/FPI ES PhD | 🔴 | (C) | — |

### Scholarships (DZ-eligible — Algerian passport advantage)
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Chevening UK** (DZ eligible, ES not) | 🔴 | (C) | DZ exclusive advantage |
| Swedish Institute (SISGP) | 🔴 | (C) | DZ on list |
| OKP/NFP Netherlands | 🔴 | (C) | developing countries |
| Campus France/Eiffel | 🔴 | (C) | via Campus France Algérie |
| **IsDB Scholarships** (OIC countries) | 🔴 | (C) | DZ is OIC member |
| OFID (<$50K, <32) | 🔴 | (C) | global |
| Mastercard Foundation (African youth) | 🔴 | (C) | — |
| **Said Foundation Oxford** (Arab citizens) | 🔴 | (C) | DZ advantage |

### Scholarships (any nationality)
| Item | Status | Cat | Notes |
|---|---|---|---|
| MEXT Japan | 🔴 | (C) | — |
| GKS/KGSP Korea | 🔴 | (C) | — |
| Türkiye Bursları | 🔴 | (C) | — |
| Gates Cambridge | 🔴 | (C) | — |
| Rhodes Oxford (18-27) | 🔴 | (C) | — |
| CSC China | 🔴 | (C) | — |

### Scholarship aggregators
| Item | Status | Cat | Notes |
|---|---|---|---|
| ScholarshipPortal | 🔴 | (C) | EU-focused |
| **Euraxess** (EU research, has API) | 🔴 | (A) | — |
| Opportunity Desk | 🔴 | (C) | — |
| Scholars4Dev | 🔴 | (C) | — |
| After School Africa | 🔴 | (C) | — |

### AI training data (user profile match — Arabic premium!)
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Scale AI** ($10-30/h, $25-50/h Arabic) | 🔴 | **(A)** | apply, no API |
| **Outlier AI** ($15-50/h, Arabic premium) | 🔴 | **(A)** | apply |
| Appen ($5-25/h) | 🔴 | (A) | apply |
| **Surge AI** ($15-40/h Arabic premium) | 🔴 | **(A)** | apply |
| DataAnnotation | 🔴 | (A) | apply |
| Toloka | 🔴 | (C) | Russian |

### Tech writing (user stack match!)
| Item | Status | Cat | Notes |
|---|---|---|---|
| **DigitalOcean** ($300-500/article — Docker, Node, Postgres = exact stack) | 🔴 | **(A)** | submit pitch |
| **Twilio** ($500/article APIs/Node) | 🔴 | **(A)** | — |
| **LogRocket** ($300-500 Node performance) | 🔴 | **(A)** | — |
| Smashing Magazine ($100-300) | 🔴 | (A) | — |
| **Draft.dev** ($300-500 agency) | 🔴 | **(A)** | — |

### Consulting / expert calls
| Item | Status | Cat | Notes |
|---|---|---|---|
| **GLG** ($200-$1,000+/h) | 🔴 | **(A)** | profile blockchain/MENA/LatAm |
| **Expert360** ($100-$300/h AU) | 🔴 | **(A)** | — |
| **Catalant** ($100-$300/h enterprise) | 🔴 | **(A)** | — |
| **Codementor** ($60-$150/h 1:1) | 🔴 | **(A)** | — |

### Crypto / DeFi opportunities
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Algora** (bounty marketplace) | 🟡 | — | `fetchAlgora()` returns empty |
| **Layer3** ($10-$1K/quest) | 🔴 | **(A)** | scraping |
| **Galxe** (campaigns NFT/airdrops, has API) | 🔴 | **(A)** | API |
| Zealy ($5-$200 community quests) | 🔴 | (A) | scraping |
| **Superteam Earn** ($1K-$10K) | 🔴 | (A) | listed but not in code |
| Dework ($50-$5K DAO tasks) | 🔴 | (A) | scraping |
| IssueHunt | 🔴 | (A) | OSS bounties |

### Translation
| Item | Status | Cat | Notes |
|---|---|---|---|
| ProZ ($0.05-$0.20/word) | 🔴 | (C) | low ROI for dev |
| Gengo ($0.03-$0.12) | 🔴 | (C) | — |
| Smartling | 🔴 | (D) | enterprise |
| Crowdin | 🔴 | (C) | OSS |

### Corporate apprenticeships
| Item | Status | Cat | Notes |
|---|---|---|---|
| Google Apprenticeships (12-24mo) | 🔴 | (C) | on-site |
| Microsoft LEAP (16 weeks) | 🔴 | (C) | on-site |
| Amazon Technical Apprenticeship | 🔴 | (C) | on-site |
| Stripe Engineering Residency | 🔴 | (C) | SF/Seattle/Dublin |
| **Automattic Code Apprenticeship** | 🔴 | (A) | 100% remote |
| **GitLab Engineering Internship** | 🔴 | (A) | 100% remote 65+ countries |
| Apple Developer Academy | 🔴 | (C) | Naples/KSA/Korea |
| MLH Fellowship | 🔴 | (C) | OSS, 100% remote |
| **GSoC** ($1.5-6.6K, 100% remote) | 🔴 | (A) | OSS summer |
| Outreachy ($7K, underrepresented) | 🔴 | (C) | — |
| LFX Mentorship ($3K-6.6K) | 🔴 | (C) | — |

### Accelerators / incubators
| Item | Status | Cat | Notes |
|---|---|---|---|
| Y Combinator (7%, $500K) | 🔴 | (C) | <10% solos |
| Antler (~10%, $100-150K) | 🔴 | (C) | ideal solos |
| Entrepreneur First (~10%, $80-100K) | 🔴 | (C) | — |
| Lanzadera Valencia (0%) | 🔴 | (C) | — |
| Startup Chile (0%, $80K) | 🔴 | (C) | — |
| Pioneer.app (1-2%, $20K, remote) | 🔴 | (C) | — |
| Climate-KIC (0%, €95K) | 🔴 | (C) | — |
| Seedcamp (7-10%, €100-475K) | 🔴 | (C) | — |
| Station F Paris | 🔴 | (C) | — |
| Wayra Madrid/BCN | 🔴 | (C) | — |
| EIT Digital Accelerator | 🔴 | (C) | — |
| Plug and Play Valencia | 🔴 | (C) | — |
| Founder Institute | 🔴 | (C) | — |
| **Hub71 Abu Dhabi** (0%, $500K) | 🔴 | (C) | — |
| Flat6Labs Cairo/Túnez/Jeddah | 🔴 | (C) | MENA |
| Oasis500 Amán (5-10%, $100K) | 🔴 | (C) | MENA |

### Prizes
| Item | Status | Cat | Notes |
|---|---|---|---|
| XPRIZE ($5M-$100M) | 🔴 | (C) | — |
| Hult Prize ($1M university) | 🔴 | (C) | — |
| MIT Solve ($10K-$200K) | 🔴 | (C) | — |
| **Stars of Science** ($300K, Arab innovators 18-35 — DZ eligible) | 🔴 | (C) | — |
| **MIT Enterprise Forum Arab** ($160K+) | 🔴 | (C) | DZ |
| **Innovation Prize for Africa** ($150K) | 🔴 | (C) | DZ |
| **Africa's Business Heroes** ($1.5M pool, $300K first, Jan-Mar 2027) | 🔴 | (C) | — |
| **Tony Elumelu Foundation** ($5K seed) | 🔴 | (C) | — |
| Social Innovation Tournament EIB (€75K) | 🔴 | (C) | — |
| ClimateLaunchpad (€10K) | 🔴 | (C) | — |
| EIC Horizon Prizes (€500K-€10M) | 🔴 | (C) | — |
| Fundación NTT DATA (€60K) | 🔴 | (C) | ES |
| BBVA Crea (€50K social) | 🔴 | (C) | ES |
| INJUVE Creación Joven (€6-9K) | 🔴 | (C) | ES |

### Aggregators
| Item | Status | Cat | Notes |
|---|---|---|---|
| **F6S** | 🔴 | (A) | startup deals |
| **EU Funding Portal REST API** | 🔴 | (A) | covered via SEDIA |
| HeroX | 🔴 | (A) | challenge prizes |
| InnoCentive/Wazoku | 🔴 | (C) | open innovation |
| Challenge.gov | 🔴 | (C) | US gov |
| AllHackathons.com | 🔴 | (C) | — |

### Ambassadors / community
| Item | Status | Cat | Notes |
|---|---|---|---|
| Docker Captains | 🔴 | (A) | community visibility |
| AWS Community Builders | 🔴 | (A) | — |
| Solana Superteam (up to $50K) | 🔴 | (A) | — |
| Polygon Ambassador | 🔴 | (A) | — |
| Chainlink Ambassador | 🔴 | (A) | — |
| Neon Ambassador ($500-5K/mo) | 🔴 | (A) | PostgreSQL |

### Passive income / affiliate
| Item | Status | Cat | Notes |
|---|---|---|---|
| Substack | 🔴 | (C) | newsletter |
| Beehiiv | 🔴 | (C) | newsletter free ≤2.5K |
| Ghost (self-host) | 🔴 | (C) | newsletter |
| Lemon Squeezy | 🔴 | (C) | digital products |
| Gumroad | 🔴 | (C) | digital products |
| Paddle | 🔴 | (C) | payments |
| Polar | 🔴 | (C) | creator |
| RapidAPI | 🔴 | (C) | API marketplace |
| Stripe Apps | 🔴 | (C) | — |
| Framer | 🔴 | (C) | templates |
| Codester | 🔴 | (C) | code marketplace |
| Acquire.com | 🔴 | (C) | digital assets |
| Flippa | 🔴 | (C) | website flipper |

---

## PILLAR 6 — LOGISTICS

**Coverage real:** 5% (8 of 155). Routing OK but **cero camping data layer** — usuario van-life sin destination intelligence.

### Routing engines
| Item | Status | Cat | Notes |
|---|---|---|---|
| **OSRM** (public + self-hosted NZ) | ✅ | — | `routing.js`, container `ultra_osrm` |
| **GraphHopper** (van restrictions) | 🔴 | (C) | docs recommend for height/weight |
| Valhalla | 🔴 | (C) | OSRM alt |
| ORS (OpenRouteService) | 🔴 | (C) | — |
| pgRouting (PostGIS) | 🔴 | (C) | — |
| OpenTripPlanner | 🔴 | (C) | multi-modal |
| **VROOM** (multi-stop TSP container) | 🟡 | — | OSRM /trip used as workaround |

### Map tile servers
| Item | Status | Cat | Notes |
|---|---|---|---|
| **OSM Raster Tiles** (public) | ✅ | — | Leaflet `map.html` |
| tileserver-gl | 🔴 | (C) | offline tile serving |
| MapTiler | 🔴 | (D) | cloud paid |
| Mapbox | 🔴 | (D) | proprietary |
| Protomaps PMTiles | 🔴 | (C) | offline single-file |
| planetiler (MBTiles/PMTiles gen) | 🔴 | (C) | needs disk space |

### Web map libraries
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Leaflet 1.9.4** | ✅ | — | `public/map.html` |
| MapLibre GL JS | 🟡 | — | researched, not used |
| Mapbox GL JS | 🔴 | (D) | proprietary |
| deck.gl (WebGL) | 🔴 | (C) | OSINT Monitor uses |
| OpenLayers | 🔴 | (C) | — |

### Mobile map apps (target export)
| Item | Status | Cat | Notes |
|---|---|---|---|
| OsmAnd | 🔴 | (C) | GeoJSON export only |
| OrganicMaps | 🔴 | (C) | — |
| Maps.me | 🔴 | (C) | legacy |
| Locus Map | 🔴 | (C) | — |
| OruxMaps | 🔴 | (C) | — |
| Gaia GPS | 🔴 | (D) | proprietary |

### GPS trackers
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Traccar** (OsmAnd protocol) | ✅ | — | container `ultra_traccar`, `traccar.js` |
| GPSLogger Android | 🔴 | (C) | mobile app |
| OwnTracks (MQTT) | 🔴 | (C) | privacy-focused |
| OsmAnd Live Tracking | 🔴 | (C) | sends to Traccar |

### POI / camping databases (THE BIG GAP)
| Item | Status | Cat | Notes |
|---|---|---|---|
| **iOverlander** (600K+ POIs global, CSV/KML/JSON exports) | 🔴 | **(A)** | Tier S #2 |
| **Park4Night** (370K+ EU, gtoselli unofficial API) | 🔴 | (C) | Tier S adjacent |
| CamperMate | 🔴 | (D) | NZ/AU app |
| WikiCamps | 🔴 | (D) | offline app |
| Hipcamp | 🔴 | (D) | US farm stays |
| freecampsites.net (US) | 🔴 | (C) | — |
| allstays | 🔴 | (D) | mobile app |
| Rankers NZ (1,500+) | 🔴 | (C) | NZ specific |
| OpenCampingMap (Overpass query) | 🟡 | — | via overpass.js |

### POI sources
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Overpass API** (OSM live queries) | ✅ | — | `overpass.js` 6 POI types |
| OSM Extract Geofabrik | 🟡 | — | NZ PBF for OSRM only, no POI extract |
| BBBike Custom Extracts (200+) | 🔴 | (C) | — |
| Mapcruzin | 🔴 | (C) | — |

### NZ government datasets
| Item | Status | Cat | Notes |
|---|---|---|---|
| **DOC NZ campsites** (ArcGIS, 312+) | ✅ | — | `doc_nz.js` |

### Housesit / pet-care platforms
| Item | Status | Cat | Notes |
|---|---|---|---|
| TrustedHousesitters ($125-299/yr) | 🔴 | (D) | global #1, no API |
| MindMyHouse ($29/yr) | 🔴 | (D) | cheapest |
| Kiwi House Sitters NZ | 🔴 | (D) | NZ specific |
| Aussie House Sitters AU | 🔴 | (D) | AU specific |
| Nomador (€34/3mo, 627+ FR) | 🔴 | (D) | EU |
| HouseSitMatch UK/EU | 🔴 | (D) | — |
| House Carers | 🔴 | (D) | — |
| House Sitters America | 🔴 | (D) | US |
| Luxury House Sitting | 🔴 | (D) | — |
| The Caretaker Gazette (1K+/yr) | 🔴 | (C) | scraping |

### Work-exchange platforms
| Item | Status | Cat | Notes |
|---|---|---|---|
| Workaway ($69-89/yr, 40K hosts, 170+ countries) | 🔴 | (D) | no API |
| Worldpackers ($59-109/yr) | 🔴 | (D) | — |
| WWOOF (per-country $0-72) | 🔴 | (D) | — |
| HelpX (~$11/2yr) | 🔴 | (D) | — |
| HelpStay (~$48) | 🔴 | (D) | — |
| Voluntouring (FREE directory) | 🔴 | (C) | scraping |
| Hopperjobs (FREE) | 🔴 | (C) | — |
| Diverbo Pueblo Inglés (FREE 8d Spain luxury) | 🔴 | (C) | — |
| CoolWorks (US #1 seasonal) | 🔴 | (C) | — |
| Hostelworks | 🔴 | (C) | — |
| **PickNZ** (NZ harvest $23.50/h) | 🔴 | (C) | NZ relevant |
| **Harvest Trail AU** (88 days = 2nd WHV) | 🔴 | (C) | AU WHV extension |

### Boat / crew (user maritime sector!)
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Find a Crew** (200+ countries, 150 opps/mo) | 🔴 | (C) | scraping |
| **Crewseekers** (25+ years) | 🔴 | (C) | — |
| **Crewbay** (transatlantic) | 🔴 | (C) | scraping |
| **OceanCrewLink** (~150/mo ocean) | 🔴 | (C) | — |

### Ferry APIs
| Item | Status | Cat | Notes |
|---|---|---|---|
| Cook Strait NZ (Bluebridge/Interislander) | 🔴 | (C) | no API |
| Bluebridge | 🔴 | (D) | no API |
| Spirit of Tasmania | 🔴 | (D) | no API |
| **Direct Ferries API** (280+ operators, 3K routes) | 🔴 | (D) | API launched |
| **Ferryhopper API** (30+ countries, 190+ operators, MCP server) | 🔴 | (D) | — |

### Inter-country transport
| Item | Status | Cat | Notes |
|---|---|---|---|
| **FlixBus** (developer.api.flixbus.com, juliuste/flix JS) | 🔴 | (C) | EU/US/Brazil |
| **BlaBlaCar** (29M users, 22 countries, REST API + arrrlo client) | 🔴 | **(A)** | — |
| Nakedbus NZ | 🔴 | (D) | — |
| Routenplaner | 🔴 | (C) | EU |
| Intercity NZ | 🔴 | (D) | no API |
| 12Go.asia | 🔴 | (D) | — |

### Flight aggregators
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Kiwi Tequila** (/v2/search + /v2/nomad multi-city) | 🟡 | (D) | `kiwi.js` stub, needs `KIWI_API_KEY` |
| Skyscanner (RapidAPI free) | 🔴 | (D) | — |
| Google Flights (no API, scrape only) | 🔴 | (C) | — |
| Amadeus (2K/mo OAuth2) | 🔴 | (D) | — |
| Sabre GDS | 🔴 | (D) | — |

### Weather APIs
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Open-Meteo** (free, 10K/day) | ✅ | — | `weather.js` 7-day forecast |
| OpenWeatherMap | 🔴 | (D) | needs key |
| MetService NZ gov | 🔴 | (C) | — |
| BOM AU | 🔴 | (C) | — |
| Weather.gov NOAA | 🔴 | (C) | covered in P1 |
| Windy API (wind/waves) | 🔴 | (C) | Leaflet plugin |

### eSIM aggregators
| Item | Status | Cat | Notes |
|---|---|---|---|
| Airalo ($4.50/1GB) | 🔴 | (D) | no API |
| Holafly (~$39.90/mo) | 🔴 | (D) | — |
| Maya Mobile | 🔴 | (D) | — |
| Ubigi | 🔴 | (D) | — |
| **eSIMDB** (300K+ plans, 140+ providers) | 🔴 | (C) | comparator |
| eSimRadar | 🔴 | (C) | — |
| eSIM Seeker (50+ providers, 228 countries) | 🔴 | (C) | — |

### Free hospitality networks
| Item | Status | Cat | Notes |
|---|---|---|---|
| Couchsurfing (paywall) | 🔴 | (D) | — |
| **BeWelcome** (FREE 165K members non-profit FR) | 🔴 | (C) | scraping |
| **Trustroots** (FREE 70K hitchhikers) | 🔴 | (C) | open source UK |
| Couchers (FREE Couchsurfing replacement) | 🔴 | (C) | open source |
| WarmShowers (cyclists $30 one-time, 185K) | 🔴 | (C) | — |
| Servas International (15K hosts 100+ countries) | 🔴 | (C) | requires refs |
| Camping My Garden (private gardens) | 🔴 | (C) | — |

### Hostel / accommodation booking
| Item | Status | Cat | Notes |
|---|---|---|---|
| Booking.com Demand API | 🔴 | (D) | case-by-case auth |
| Hostelworld partner-api | 🔴 | (D) | case-by-case auth |
| Airbnb (no official) | 🔴 | (D) | scraping needed |

### Skill-exchange networks
| Item | Status | Cat | Notes |
|---|---|---|---|
| Simbi (FREE bartering YC-backed) | 🔴 | (C) | — |
| TimeRepublik (FREE time bank) | 🔴 | (C) | — |
| CES (Community Exchange 77K users 49 countries) | 🔴 | (C) | — |
| LETS | 🔴 | (C) | local currency |
| **ToitChezMoi** (FREE housing for tech services FR) | 🔴 | (C) | DIRECT user fit |

### Vehicle compliance
| Item | Status | Cat | Notes |
|---|---|---|---|
| NZ Self-Contained Vehicle Act (June 2026 deadline, $400 fines) | 🟡 | — | warrant in `bur_documents` |
| NZTA rules | 🔴 | (C) | research only |
| AU Rego (state-based) | 🔴 | (C) | — |

### Storage / mail forwarding
| Item | Status | Cat | Notes |
|---|---|---|---|
| SpainBOX (€3 receive €5 forward) | 🔴 | (C) | — |
| NZ Post ParcelPod (24/7 lockers) | 🔴 | (C) | — |
| Poste Restante | 🔴 | (C) | — |

### Free transport hacks
| Item | Status | Cat | Notes |
|---|---|---|---|
| HitchWiki (XML dumps + HuggingFace dataset) | 🔴 | (C) | hitchhike data |
| **Auto Driveaway** (FREE car + first tank to relocate) | 🔴 | (C) | US/CA — money saver |
| **TransferCar** ($1/day motorhome relocation US/CA/AU/NZ) | 🔴 | **(A)** | NZ relevant |
| **Imoova** ($1/day motorhome relocation) | 🔴 | **(A)** | NZ relevant |

### Food / meal hacks
| Item | Status | Cat | Notes |
|---|---|---|---|
| Too Good To Go (38M users, 1/3 price) | 🔴 | (D) | no API |
| OLIO (free food sharing) | 🔴 | (D) | — |
| Falling Fruit (wild edibles map) | 🔴 | (C) | — |
| Freedge (community fridges) | 🔴 | (C) | — |
| **Freecycle** (9M members, 110+ countries, npm scraper) | 🔴 | (A) | available |

### Cost of living
| Item | Status | Cat | Notes |
|---|---|---|---|
| Numbeo (9K+ cities) | 🔴 | (D) | $50-500/mo |
| **Nomad List** (100K+ data points, gem API) | 🔴 | (A) | free tier |

### Other services
| Item | Status | Cat | Notes |
|---|---|---|---|
| **WiFi Map** (data.wifimap.io 150M hotspots) | 🔴 | **(A)** | REST free |
| **OpenWiFiMap** (open source Swagger) | 🔴 | **(A)** | — |
| **Open Charge Map** (EV charging REST) | 🔴 | **(A)** | global |
| Chargetrip API (EV routing FREE) | 🔴 | (A) | — |
| TomTom EV | 🔴 | (D) | — |
| Chargeprice API | 🔴 | (C) | — |
| NREL PVWatts (solar calculator) | 🔴 | (C) | van solar |
| Open Food Facts | 🟡 | — | covered in P7 |
| USDA FoodData | 🔴 | (D) | covered in P7 |
| FatSecret (56 countries nutrition) | 🔴 | (D) | — |

### Community / ecovillages
| Item | Status | Cat | Notes |
|---|---|---|---|
| Global Ecovillage Network (GEN) | 🔴 | (C) | per-country |
| ic.org (1K+ intentional) | 🔴 | (C) | — |
| icmatch.org (person-community matching) | 🔴 | (C) | — |
| Kibbutz Volunteers (18-35 yr) | 🔴 | (C) | — |
| Vipassana (10-day free + meals) | 🔴 | (C) | global |

### Repos referenced
| Repo | Stars | Status |
|---|---|---|
| cbovis/awesome-digital-nomads | high | 🔴 reference |
| awesomelistsio/awesome-digital-nomads | high | 🔴 reference |
| Couchers-org/couchers | open source | 🔴 NOT USED |
| lukem512/freecycle (npm) | low | 🔴 NOT USED |
| arrrlo/BlaBlaCar-Client-Api | low | 🔴 NOT USED |
| jessehanley/nomadlist-gem (Ruby) | low | 🔴 NOT USED |
| **mealie-recipes/mealie** (deployed for P7) | high | ✅ |
| mauriceboe/TREK (3.3K self-hosted travel planner) | 3.3K | 🔴 NOT USED |
| VROOM-Project/vroom | 1.2K | 🔴 NOT USED |
| **Project-OSRM/osrm-backend** | 7.6K | ✅ self-hosted NZ |
| Hitchwiki/hitchhiking-data | low | 🔴 NOT USED |
| mwiede/camping-poi (Park4Night dump-station) | low | 🔴 NOT USED |
| osm2pgrouting | 300 | 🔴 NOT USED |
| gtoselli/park4night-api | low | 🔴 NOT USED |
| AWeirdDev/flights | medium | 🔴 NOT USED |

---

## PILLAR 7 — BIO-CHECK

**Coverage real:** 18% (33 of 183). **Best containers**, but wearables 0/13, meditation 0/7, habit tracking 0/5.

### Fitness trackers self-hosted
| Item | Status | Cat | Notes |
|---|---|---|---|
| **wger** (5.9K⭐, 414+ exercises) | ✅ | — | container `ultra_wger`, `wger.js` |
| **FitTrackee** (1.1K⭐) | 🔴 | (C) | self-hosted alt |
| Endurain (200⭐, Strava/Garmin integration) | 🔴 | (C) | — |
| ExerciseDB RapidAPI | 🔴 | (D) | needs API key |
| API Ninjas Exercises (10K req/mo free) | 🔴 | (D) | needs key |
| **free-exercise-db** (GitHub static) | 🔴 | **(A)** | free dataset |
| Bodyweight Fitness (Recommended Routine) | 🔴 | (C) | calisthenics |
| Convict Conditioning (6 movements × 10 levels) | 🔴 | (C) | minimalist |
| StartBodyweight.com | 🔴 | (C) | — |
| Hybrid Calisthenics YouTube | 🔴 | (C) | video |
| YogaWithAdri YouTube | 🔴 | (C) | yoga |
| McGill Big 3 (injury prevention) | 🔴 | (C) | protocol |
| Parkrun events | 🔴 | (C) | community |

### Nutrition / meal planning
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Open Food Facts** (3M+ barcode) | ✅ | — | `openfoodfacts.js` |
| **Mealie** (11.9K⭐) | ✅ | — | container `ultra_mealie` |
| **Grocy** (van pantry) | ✅ | — | container `ultra_grocy` |
| **USDA FoodData Central** | 🔴 | (D) | needs free key |
| **CalorieNinjas** (NL parsing) | 🔴 | **(A)** | pairs perfect with OFF |
| Spoonacular (150 pts/day) | 🔴 | (D) | needs key |
| Tandoor Recipes (8.1K⭐) | 🔴 | (B) | could replace Mealie |
| OpenNutriTracker (1.7K⭐ Flutter) | 🔴 | (C) | mobile |
| KitchenOwl | 🔴 | (C) | inventory alt |
| Pantry | 🔴 | (C) | — |
| FoodInventory | 🔴 | (C) | — |
| RecipeSage | 🔴 | (C) | recipe alt |
| Clementine | 🔴 | (C) | — |

### Wearable trackers (CRITICAL GAP — 0/13)
| Item | Status | Cat | Notes |
|---|---|---|---|
| Fitbit Web API (OAuth) | 🔴 | (D) | needs hardware + OAuth |
| Oura Ring API | 🔴 | (D) | $300 hardware + OAuth |
| Withings API | 🔴 | (D) | hardware + OAuth |
| Garmin via GarminDB | 🔴 | (D) | hardware + setup |
| Apple Health | 🔴 | (D) | iOS only |
| Google Fit / Health Connect HCGateway | 🔴 | (D) | Android |
| Suunto | 🔴 | (D) | hardware |
| Polar | 🔴 | (D) | hardware |
| **open-wearables** (551⭐ unified API) | 🔴 | (C) | aggregation layer |
| **GarminDB** (Garmin Connect parser) | 🔴 | (C) | — |
| **Gadgetbridge** (4.5K⭐ Mi Band+) | 🔴 | (C) | budget wearables |
| **Mi Band 8** (~$30) | 🔴 | **(A)** | cheapest MVP |

### Habit / mood
| Item | Status | Cat | Notes |
|---|---|---|---|
| **bio_mood custom table** | ✅ | — | mood/energy/anxiety 1-10 |
| **bio_journal Markdown** | ✅ | — | with sentiment |
| **bio_cbt_prompts** (30 seed CBT/DBT/ACT/positive_psych) | ✅ | — | — |
| Habitica (gamified) | 🔴 | (C) | RPG habits |
| **Loop Habit Tracker / uhabits** (9.8K⭐) | 🔴 | **(C)** | Android #1 |
| HabitNow | 🔴 | (C) | — |
| HabitKit | 🔴 | (C) | — |
| iHabit | 🔴 | (C) | — |
| Daylio | 🔴 | (C) | mood alt |
| MoodTracker | 🔴 | (C) | — |
| Aware | 🔴 | (C) | — |
| Reflectly | 🔴 | (C) | journaling |
| Mindstrong | 🔴 | (C) | — |
| open-nomie/nomie5 (559⭐) | 🔴 | (C) | personal tracking |
| **Obsidian mood tracker plugin** | 🔴 | **(A)** | local-first MD |

### Meditation / mindfulness (0/7)
| Item | Status | Cat | Notes |
|---|---|---|---|
| Medito (1.2K⭐ free open source) | 🔴 | (C) | Flutter |
| Insight Timer (250K+ meditations) | 🔴 | (A) | free tier |
| Calm | 🔴 | (D) | $12.99/mo |
| Headspace | 🔴 | (D) | paywall |
| Smiling Mind (free AU) | 🔴 | (C) | mindfulness |
| Plum Village (Thich Nhat Hanh) | 🔴 | (C) | online courses |
| Vipassana retreats (free 10-day) | 🔴 | (C) | reference |

### Sleep tracking
| Item | Status | Cat | Notes |
|---|---|---|---|
| **bio_checks.sleep_quality custom** | ✅ | — | hours + 1-10 |
| Nyxo (302⭐ React Native) | 🔴 | (C) | sleep coaching |
| Sleep as Android (~$15 + OAuth) | 🔴 | (D) | — |
| Oura/Fitbit sleep | 🔴 | (D) | covered above |
| SleepCycle | 🔴 | (D) | paywall |
| Pillow / AutoSleep | 🔴 | (D) | iOS paywall |

### Period / cycle
| Item | Status | Cat | Notes |
|---|---|---|---|
| Drip / Period Tracker / Clue API | 🔴 | (D) | not relevant |

### Public health alerts
| Item | Status | Cat | Notes |
|---|---|---|---|
| **WHO Disease Outbreak News** | ✅ | — | `health_scrapers.js` |
| **CDC Travel Advisories** | 🟡 | — | levels extracted |
| **ECDC weekly threat reports** | ✅ | — | — |
| **ProMED-mail** | 🔴 | **(A)** | covered in P1 too |
| GISAID (genomic) | 🔴 | (C) | — |
| GPMB (preparedness) | 🔴 | (C) | — |
| **MAEC España travel advisories** | 🔴 | **(A)** | scraping |
| GDELT (news aggregator) | 🟡 | — | covered in P1 |

### Vaccinations
| Item | Status | Cat | Notes |
|---|---|---|---|
| **bur_vaccinations** (P4 owned, P7 consumes) | ✅ | — | events_store consume |
| **RECOMMENDED_VACCINES mapping** (30 countries) | ✅ | — | `health_destination_check.js` |
| CDC Vaccination DB | 🔴 | (C) | reference |
| WHO vaccination schedules | 🔴 | (C) | reference |
| Country-specific registries (15+) | 🔴 | (C) | — |

### Healthcare directories
| Item | Status | Cat | Notes |
|---|---|---|---|
| **bio_healthcare_systems table** (10 countries seed) | ✅ | — | NZ/AU/ES/FR/GB/US/CA/DZ/MA/JP |
| UK NHS Directory | 🔴 | (C) | provider lookup |
| France Sécu Sociale | 🔴 | (C) | — |
| Spain Sanidad | 🔴 | (C) | — |
| NZ ACC + DHB locator | 🔴 | (C) | — |
| AU Medicare + My Health Record | 🔴 | (C) | — |

### Therapy directory
| Item | Status | Cat | Notes |
|---|---|---|---|
| **bio_therapy_directory** (21 providers seed) | ✅ | — | ES/NZ/AU/FR/DZ/US/GB |
| BetterHelp ($65-100/wk) | 🟡 | — | seeded |
| Talkspace | 🟡 | — | seeded |
| TherapyChat (€35-60) | 🟡 | — | seeded |
| 7 Cups (free peer + AI) | 🟡 | — | seeded |
| OpenPath ($30-80 sliding) | 🟡 | — | seeded |
| iPrevail (free peer) | 🟡 | — | seeded |
| Woebot (free CBT AI) | 🟡 | — | seeded |
| **España 024 suicide hotline FREE** | 🟡 | — | seeded |
| **NZ Lifeline 0800 543 354 FREE** | 🟡 | — | seeded |
| **Australia 13 11 14 FREE** | 🟡 | — | seeded |
| **France 3114 FREE** | 🟡 | — | seeded |
| **UK Mind FREE** | 🟡 | — | seeded |

### Mental health frameworks
| Item | Status | Cat | Notes |
|---|---|---|---|
| **CBT protocols** | ✅ | — | bio_cbt_prompts |
| **DBT techniques** | ✅ | — | included |
| **ACT** | ✅ | — | included |
| **Mindfulness** | ✅ | — | included |
| **Positive psychology + gratitude** | ✅ | — | included |
| **Burnout assessment** | ✅ | — | category in cbt_prompts |
| EMDR | 🔴 | (C) | specialized |
| **Journaling structure** | ✅ | — | bio_journal |

### Health record aggregation
| Item | Status | Cat | Notes |
|---|---|---|---|
| **Fasten-onprem** (2.6K⭐, 650+ providers USA) | ✅ | — | container `ultra_fasten` |
| OpenEMR | 🔴 | (C) | medical records alt |
| OpenMRS | 🔴 | (C) | patient management |
| MedKit | 🔴 | (C) | health vault |
| **health_documents table** | ✅ | — | with paperless_id link |

### Biohacking / advanced
| Item | Status | Cat | Notes |
|---|---|---|---|
| Heat acclimation | 🔴 | (C) | environmental |
| Altitude training | 🔴 | (C) | — |
| Jet lag protocols (Timeshifter $10/yr) | 🔴 | (D) | — |
| L-Theanine stacking | 🔴 | (C) | supplements |
| **Intermittent fasting protocols** (16:8, OMAD, 5:2) | 🔴 | (C) | tracking gap |
| Sauna therapy | 🔴 | (C) | recovery |
| Blue Zones principles | 🔴 | (C) | longevity |
| **HRV tracking** | 🟡 | — | bio_checks.hrv field exists, no source |
| **Body composition** | ✅ | — | bio_checks.body_fat_pct |
| Biomarkers (annual checkup) | 🔴 | (C) | lab logging |
| **Stress level tracking** | ✅ | — | bio_checks.stress_level |

### Climate / environmental
| Item | Status | Cat | Notes |
|---|---|---|---|
| **UV Index APIs (UVLens, OpenUV)** | 🔴 | **(A)** | free |
| NOAA early warning (covered P1) | 🟡 | — | — |
| ReliefWeb disasters | 🔴 | (D) | Hetzner blocked |
| **CO2 monitor van-life** | 🔴 | (C) | hardware sensor |

### Workout programs
| Item | Status | Cat | Notes |
|---|---|---|---|
| RP Diet Coach | 🔴 | (D) | paid |
| JEFIT | 🔴 | (D) | — |
| StrongLifts (5x5) | 🔴 | (C) | program template |
| workout-cool (music-synced) | 🔴 | (C) | — |
| Strava (GPS cycling/running OAuth) | 🔴 | (D) | — |

### Infrastructure / containers
| Item | Status | Cat | Notes |
|---|---|---|---|
| **wger container** (8001) | ✅ | — | — |
| **Mealie container** (8002) | ✅ | — | — |
| **Grocy container** (8003) | ✅ | — | — |
| **Fasten-onprem container** (8004) | ✅ | — | — |
| **Health probes** (undici insecure agent) | ✅ | — | `external_health.js` |
| **Custom Node middleware** | ✅ | — | wger/openfoodfacts/health_scrapers/health_destination_check |

### Hydration / water
| Item | Status | Cat | Notes |
|---|---|---|---|
| **bio_checks.water_ml** | ✅ | — | — |
| Hydration trackers (apps) | 🔴 | (C) | — |

### Reference repos
| Item | Status | Cat | Notes |
|---|---|---|---|
| woop/awesome-quantified-self | 🔴 | (C) | reference |
| Dieterbe/awesome-health-fitness-oss | 🔴 | (C) | reference |
| kakoni/awesome-healthcare (3.7K⭐) | 🔴 | (C) | reference |

---

## CROSS-CUTTING INFRASTRUCTURE

| Item | Status | Notes |
|---|---|---|
| Docker compose orchestration | ✅ | 12 containers running |
| PostgreSQL 16 | ✅ | 50+ tables |
| Telegram bot | ✅ | 35+ commands |
| Cron scheduler (node-cron) | ✅ | 32 jobs |
| Event bus (in-memory + persisted) | ✅ | `eventbus.js` |
| Cross-pillar bridges | ✅ | 4 subscribers |
| Service Worker offline-first | ✅ | `public/sw.js` |
| Web map UI | ✅ | `public/map.html` |
| Public webhooks router | ✅ | `routes/webhooks.js` |
| JWT auth | ✅ | `middleware/jwt-auth.js` |
| API key auth | ✅ | `middleware/auth.js` |

---

## TIER S items (6 critical, sprint-ready)

| # | Pillar | Item | Estimate | Why critical |
|---|---|---|---|---|
| **1** | P2 | Maritime scrapers (CrewBay/AllCruiseJobs/SeaJobs) + 5 Workday tenants (Royal Caribbean/Wilhelmsen/DP World/Maersk/BHP) | 5-8h | User's primary declared sector, 0% coverage |
| **2** | P6 | iOverlander 600K POIs CSV/GeoJSON import to log_pois | 4-6h | Van-life critical destination intelligence |
| **3** | P1 | OSINT Monitor 379 feeds port + tier+propaganda+state_affiliated metadata schema | 4-6h | Recover 94% of researched feed coverage in P1 |
| **4** | P4 | passport-index-dataset (199 countries) full CSV import | 2-3h | 188 manual → 199×N=~40K cells matrix |
| **5** | P1 | Adam Isacson OPML LatAm (140+ feeds) bulk import | 2-3h | Single OPML, entire LatAm region in one shot |
| **6** | P7 | Generic wearable webhook `/webhooks/wearable` for ingest from Gadgetbridge/GPSLogger/OwnTracks/curl | 4-5h | Unblock orphan bio_checks fields (sleep/HR/HRV/steps) |

**Total Tier S sprint:** ~21-31 hours

---

## TIER A QUICK WINS (~150 items, ordered by impact)

Items < 4h, free, no auth, no blockers, high value. Can be done in 1-day batches without user-action.

### P1 News quick wins (~25 items)
1. GDACS RSS (earthquakes/floods/cyclones/fires) — 1h
2. ProMED RSS (disease outbreaks) — 1h
3. International Crisis Group RSS — 1h
4. FEWS NET RSS (food security Africa) — 1h
5. US State Dept Travel Advisories RSS — 1h
6. Australian Smartraveller API — 1h
7. CDC Outbreaks RSS — 1h
8. MAEC España travel advisories scraper — 2-3h
9. Mastodon API (per profile RSS) — 2h
10. YouTube Data API + RSS per channel — 2h
11. Podcast Index API (search/episodes) — 2h
12. Apple Podcasts Search — 1h
13. spaCy NER baseline (replace NER lite stub) — 2h
14. Kill the Newsletter (self-hostable email→RSS) — 2h
15. Complete WHO DONS stub — 1h
16. GDELT CAST wire to scheduler — 1h
17-25. Multilingual feeds (Agencia EFE, Jeune Afrique, RFI Afrique, Lusa, Al Jazeera EN, Mideastwire, Le Monde, La Tercera updates, Khaleej Times) — ~10h

### P2 Empleo quick wins (~10 items)
26. Job Bank Canada XML feed — 1-2h
27. EURES REST API (28 EU countries) — 2h
28. Rigzone RSS (oil/gas) — 15min
29. SiaExplains/visa-sponsorship-companies (50+ countries) — 4h
30. CA LMIA importer — 2h
31. AU visa sponsor lists (geshan repo) — 2h
32-35. Workday tenants beyond Tier S (Atlassian, Stripe, Twilio, Cisco, Adobe, etc) — research-heavy, 3-5h

### P3 Finanzas quick wins (~5 items)
36. PAYE NZ tax calculator (hardcode thresholds) — 1.5h
37. Stooq historical OHLCV extension — 2h
38. Recurring confirmation endpoint — 2h
39. Budget carryover SQL implementation — 2h
40. Add npm `afinn` if migrating P1 NLP — 1h

### P4 Burocracia quick wins (~10 items)
41. n8n container deploy — 2h container, +2-3h workflows
42. Apprise multi-channel notif library — 3h
43. CalDAV / Google Calendar export for tax deadlines — 3h
44. Tax deadline seed data for ES/NZ/AU — 1h
45. Embassy data scrape (Wikipedia + gov.uk MOFA) — 2-3h
46. paperless-ai container if user adds OPENAI_API_KEY — 1h
47. schengencalc npm migration (replace 120 LOC) — 30min
48-50. Apostille tracker, driver license tracker, military service DZ — 3-4h each

### P5 Oportunidades quick wins (~30 items)
51. We Work Remotely RSS — 1-2h
52. DailyRemote RSS — 1h
53. Nodesk RSS — 1h
54. Intigriti RSS (EU bug bounty) — 1h
55. Huntr (OSS bounties) — 1-2h
56. clist.by aggregator API — 1-2h
57. CTFtime RSS+API — 1-2h
58. Kaggle competitions scraper — 2-3h
59. CodeChef contests API — 1h
60. ETHGlobal calendar scraper — 2-3h
61. Solana Colosseum hackathons — 2-3h
62. Galxe API (crypto quests) — 2h
63. Layer3 quests scraper — 2-3h
64. Zealy quests scraper — 2-3h
65. Dework DAO bounties — 2-3h
66. IssueHunt OSS bounties — 1-2h
67. GetOnBoard LatAm public API — 2h
68. Torre.ai LatAm + MCP — 2h
69. F6S aggregator — 1h
70. Euraxess (EU research API) — 2h
71. Sovereign Tech Fund announcements — 2h
72. GitHub Fund announcements — 1h
73. FLOSS/Fund — 2h
74-79. Tech writing (DigitalOcean/Twilio/LogRocket/Smashing/Draft.dev) — ~10h
80-83. AI training (Scale/Outlier/Appen/Surge) — apply, ~4h
84-87. Consulting (GLG/Expert360/Catalant/Codementor) — apply, ~3h
88. Lablab.ai verify function — 30min
89. Verify NLnet function exported — 30min
90. Freelancer.com persistence to opportunities table — 2h
91. Garantía Juvenil ES — 1h
92. Kit Digital ES — 1h
93. Horizon Europe scraper — 3h
94. EIC Accelerator scraper — 2-3h

### P6 Logística quick wins (~15 items)
95. WiFi Map API (data.wifimap.io) — 2-3h
96. OpenWiFiMap (Swagger) — 2h
97. Open Charge Map EV — 2h
98. Chargetrip API (EV routing) — 2h
99. Nomad List free tier — 2h
100. BlaBlaCar REST API + arrrlo client — 2-3h
101. Booking.com Demand API (case-by-case) — 2h pre-auth
102. Hostelworld partner-api — 2-3h
103. TransferCar $1/day NZ relocation — 2h scraping
104. Imoova relocation — 2h scraping
105. Park4Night gtoselli unofficial API — 3h
106. Freecycle scraper (npm package available) — 2h
107. NZ vehicle compliance Self-Contained alerts — 2h
108. AU Rego per-state — 2h
109. eSIMDB comparator — 2-3h

### P7 Bio-check quick wins (~10 items)
110. CalorieNinjas NL parsing (pair with OFF) — 2h
111. Loop Habit Tracker uhabits Android sync — 3h
112. Insight Timer free tier integration — 2-3h
113. UVLens / OpenUV API — 2h
114. free-exercise-db static dataset — 1h
115. USDA FoodData fallback to OFF — 2-3h
116. Bio biomarkers logging table + endpoints — 2h
117. Intermittent fasting tracker — 2h
118. Tandoor Recipes alt research — 1h decision
119. Obsidian mood tracker plugin docs — 1h

---

## How to read this document

- **Find a specific tool/repo**: Ctrl+F search by name
- **Find what's missing per pillar**: jump to pillar section, look for 🔴 status
- **Find what's done**: search ✅
- **Plan next sprint**: look at "Tier S items" or "Tier A quick wins" sections
- **Audit a category**: e.g. "Wearables" → P7 section → 0/13 means none implemented
- **Estimate user-action backlog**: search `(D)` blockers → ~180 items waiting for keys/OAuth

## Maintenance

This file is the **canonical inventory**. Update when:
- An item is integrated → change 🔴/🟡 → ✅
- A new tool is investigated → add row with status
- A category is closed → mark with date in pillar header

**Last updated:** 2026-04-07 (Audit phase, before Tier S sprint)
