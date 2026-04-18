# BLOCKERS.md — Intervención del usuario requerida

Lista viva de cosas que necesitan al usuario. Yo sigo trabajando en lo que puedo avanzar sin ellas.

**Formato:** `[YYYY-MM-DD HH:MM] · prioridad · descripción · cómo desbloquear`

---

## 🔴 Pendientes de aprobación humana (no puedo avanzar solo)

### [2026-04-18 02:05] · alta · Review humano Fase 2 Work antes de Fase 3 (R5)
Según brief de migración, cada fase requiere stop+review humano antes de la siguiente.

**Deliverables Fase 2 completos (local, no committed):**
- 10 archivos nuevos en `ultra-engine/web/src/` (sections/work + 4 ui components + 2 tests).
- 1 extensión backend: `routes/opportunities.js` GET `/` con `min_score` + `q` + filtro `duplicate_of`.
- Route `/app/work/*` con 3 sub-tabs (overview/matches/pipeline), drawer lateral, status actions.
- Build 291KB / 88KB gzip. 26/26 tests verdes. Typecheck limpio.
- Verificado live con datos reales: top score 49, pipeline 11977 total, filtros operativos.

**Cómo desbloquear:**
Probar `/app/work`, `/app/work/matches`, `/app/work/pipeline` en navegador. Confirmar UX. OK o feedback.
**Yo sigo construyendo Fase 3 en paralelo** asumiendo que el patrón Work queda como template.

---

### [2026-04-18 01:55] · alta · Commit + push Fase 1.1 + Fase 1.2 + Fase 2 (React SPA skeleton + home aggregator + Work)
**Qué hay listo localmente:**
- `ultra-engine/web/` — SPA React/Vite/TS completa (28 archivos .tsx/.ts, 17/17 tests, typecheck clean, build 272KB/83KB gzip).
- `ultra-engine/src/routes/home.js` — agregador `/api/home/overview` (296 LOC, Promise.allSettled + graceful partial, 7/7 contract tests en container real).
- `ultra-engine/src/domain/` — 7 módulos (bio, bureaucracy, finances, logistics, opportunities, wm-news, home-cache).
- `ultra-engine/tests/home-overview.test.js` — 7 tests integration contra container en vivo.
- `server.js` — `requireAuth` + mount `/api/home` + fallback `/app/*` → SPA.
- Limpieza: 28 `.js` stubs borrados de `web/src/`, `noEmit:true` en tsconfig, `src/**/*.js` en .gitignore.
- Verificado live: `/app/*` → 200, `/api/home/overview` → 200 con datos reales (5 opps score≥8, presupuesto 178% overspend, 10 topic spikes world).

**Cómo desbloquear:**
Revisar `git status` y `git diff`, dar OK para crear commit + push.
Propuesta de commits (divididos por bloque coherente):
1. `feat(home): /api/home/overview aggregator + 7 domain modules + 7 contract tests`
2. `feat(web): React/Vite/TS SPA skeleton with HomeCard/MustDoStrip/SectionShell + 17 tests`
3. `feat(work): Fase 2 — 3 sub-tabs + MatchCard + DetailDrawer + TabNav + filters + 9 tests`
4. `feat(me): Fase 3 — 3 sub-tabs (overview/docs/bio) reusando patrón Work + 4 tests`
5. `feat(moves): Fase 3 — 3 sub-tabs (overview/upcoming/memberships) + 4 tests`
6. `feat(money): Fase 3 — thin wrapper con 4 KPIs + CTA a /money.html cockpit legacy`
7. `feat(shell): topbar sticky + atajos g+letra vim-style (Fase 5 MVP, sin Cmd+K palette aún)`

**Si pushes, dispara `.github/workflows/deploy.yml` → despliegue a ct4-bot (prod).**

---

### [2026-04-18 01:55] · baja · Otros cambios sueltos sin commit (pre-existentes, no de esta sesión)
Detectados en `git status` al comenzar, **no tocados por mí**:
- `M` `.gitignore`, `BACKLOG.md`, `ultra-engine/package.json|package-lock.json`, `ultra-engine/server.js`.
- `M` rutas: `bio.js`, `bureaucracy.js`, `finances/budget.js`, `finances/core.js`, `logistics.js`, `opportunities.js`, `wm/news.js`.
- `??` `CHANGELOG.md`, `ultra-engine/src/country_detect.js`, `ultra-engine/src/jobspy_massive.js`, `ultra-engine/src/routes/admin.js`.

**Cómo desbloquear:** Cuando te conectes, revisa `git status` y decide si estos cambios son tuyos previos (commiteables) o basura a limpiar. Yo no los toco.

---

## 🟡 Credenciales / servicios externos (rozan el techo funcional)

Ninguna ahora mismo. `.env` tiene las claves necesarias (JWT, DB, Telegram, FRED/FMP/Finnhub/EIA, Adzuna, etc.).

---

## 🟡 Deuda técnica priorizada (no bloquean user, pero son fases siguientes)

### [2026-04-18 02:22] · alta · Fase 4 World — re-arch worldmap en React
Brief dice overview/map-calm/deep + eliminar Trader mode + cluster dedup + anti-SEO filter en `config/news-blocklist.yml`. El worldmap.html (180KB legacy) funciona bien; re-arch React es ~1-2 semanas de trabajo. Actualmente /app/world es CTA a /worldmap.html.

### [2026-04-18 02:22] · media · Cmd+K command palette
Hook `useKeyboardNav` ya maneja chord g+letra. Falta palette overlay con búsqueda fuzzy + jump a cualquier sub-ruta. Reusar fuzzyMatch de worldmap-utils.js o portar a TS.

### [2026-04-18 02:22] · media · Jobs mergeados en Work Matches
Ahora Work Matches solo muestra `opportunities` (11977). `job_listings` (13577) también quedan, pero separados. Mergear con unified scoring + filter `has_visa_sponsor=true` (cross-ref emp_visa_sponsors) para "aplicables ya".

### [2026-04-18 02:22] · baja · Paperless-ngx → document_alerts cron
Container corre, OCR activo. Cron que lea documentos paperless → extraiga expiry → INSERT automático en document_alerts.

### [2026-04-18 02:22] · baja · Bio micro-log mobile
`bio_checks` 0 rows → usuario nunca loggea. Flow one-tap mood/energy/sleep en 5 segundos desde mobile. MePage/Bio ahora solo muestra — falta el POST.

### [2026-04-18 02:22] · baja · POI map en Moves
46554 POIs en DB (Overpass + DOC NZ). Mapa con filtro "free + has_water" diferido hasta tener coord selector UX.

### [2026-04-18 02:22] · baja · Full migración Money Cockpit
/money.html (3500 LOC · 14 paneles) sigue siendo crown jewel. Migración progresiva a /app/money en fase futura.

---

## 🟢 Decisiones estratégicas pendientes

### [2026-04-18 01:55] · media · ¿Se mata el legacy `index.html` cuando Fase 1 React esté pusheada, o se mantiene redirect?
El brief de migración (`dashboard_react_migration_plan.md`) dice "migración progresiva: cuando una sección `/app/X` esté lista, la ruta legacy redirige". Home ya está lista en `/app/`. Pero `index.html` es la primera página que ve el usuario al login.

**Propuesta:** mantener `/` (index.html) hasta Fase 5 (sidebar + topbar estén pulidos en React); cambiar el redirect post-login a `/app/` cuando validemos Fase 1 en tu navegador.

**Cómo desbloquear:** Dame OK para redirigir `/` → `/app/` en `server.js` cuando quieras saltar del legacy.

---

## Histórico (resuelto)

_ninguno aún_
