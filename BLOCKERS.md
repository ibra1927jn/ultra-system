# BLOCKERS.md — Intervención del usuario requerida

Lista viva de cosas que necesitan al usuario. Yo sigo trabajando en lo que puedo avanzar sin ellas.

**Formato:** `[YYYY-MM-DD HH:MM] · prioridad · descripción · cómo desbloquear`

Última actualización: 2026-04-18 07:05 tras HomeCard preview navigation + harvest calendar DB + payroll NZ Holidays Act.

---

## 🔴 Pendientes de aprobación humana

_ninguno crítico. Usuario concedió control total 2026-04-18. Sesión autónoma activa 10h._

---

## 🟡 Próximos sprints / deuda técnica priorizada

### [2026-04-18 04:20] · alta · Fase 4 World mapa real (Leaflet/SVG choropleth)
Todas las demás piezas de World están completas en la SPA:
- Volume KPIs (h1/h24/spikes/health)
- Top por continente + topic spikes
- Compare countries side-by-side (hasta 4)
- News feed filtrable + ArticleReader con fulltext scrape + translate
- Intelligence brief (convergence zones + top signal countries)
- Health alerts WHO/CDC/ECDC

**Lo que falta:** mapa interactivo. Opciones:
- Leaflet + react-leaflet (~45KB gzip + CSS) — completo pero pesado
- SVG choropleth desde ne_110m_countries.geojson (838KB — needs simplify con turf o servir externo, lazy-loaded)
- Skip y mantener CTA legacy → /worldmap.html

**Recomendación:** SVG choropleth lazy-loaded al entrar a sub-ruta `/app/world/map`. 4-6h de trabajo.

### [2026-04-18 04:20] · media · Jobs pipeline kanban (paralelo a opps)
WorkPipeline ahora solo muestra opportunities. Añadir toggle source o
tab independiente para jobs con status new/saved/applied/rejected.

### ~~[2026-04-18 04:20] · media · Edit logistics (form completo)~~ ✅ DONE
`LogisticsEditModal` expone todos los campos (type, title, date,
location, notes, status, cost) con DetailDrawer y PATCH /:id.

### ~~[2026-04-18 04:20] · media · HomeCard preview click-to-navigate~~ ✅ DONE 2026-04-18 07:05
Backend `buildSectionFromRaw` inyecta `href` por item (me→bio,
work→matches, money→money, moves→upcoming/timeline).
PreviewItemSchema extendido, HomeCard renderiza Link por item.
Commit 6841e11.

### [2026-04-18 04:20] · baja · Auto-reverter en algunos files
Durante la sesión algunos files se revirtieron tras Edit/Write
(`index.html`, `MeBio.tsx`, `MeTimeline.tsx`, `TopBar.tsx`,
`useKeyboardNav.ts`). Workaround aplicado: mover nueva funcionalidad
a archivos standalone (MustDoBadge, WorldIntel, MovesPoi, etc.).
Algunos mini-features quedaron descartados:
- Timeline search
- n+letter chords quick-add
- MustDo badge integrado en TopBar (movido a MustDoBadge floating)

### [2026-04-18 04:20] · baja · PWA icons PNG 192/512 reales
`manifest.webmanifest` ahora usa favicon.svg como icon universal. iOS/
Android lo aceptan pero puede mejorarse con PNG dedicados generados
con pwa-asset-generator o ImageMagick.

### [2026-04-18 04:20] · baja · Focus trap en DetailDrawer
ESC + overlay click funcionan. Tab cycling dentro del drawer no está
implementado — con focus-trap-react (2KB) o nativo con sentinel nodes.

### [2026-04-18 04:20] · baja · Paperless cron para document_alerts
Ya existe (`paperless-ocr-sync` cada 6h :40). User solo tiene 1 doc
en paperless — cuando suba más, se poblarán automáticamente.

---

## 🟢 Otros cambios pre-existentes committeados sin revisión

Durante un `git add ultra-engine/src/` amplio (commit 8ce875c) se
colaron 3 archivos untracked que no eran míos:
- `ultra-engine/src/country_detect.js` — normalizador ISO para jobs
- `ultra-engine/src/jobspy_massive.js` — JobSpy massive multi-site
- `ultra-engine/src/routes/admin.js` — admin router P0-1.3

**Estado:** Ninguno está mounted en server.js — son dead code. No rompen nada.

**Cómo desbloquear:** Decidir si los wireas o los borras. El código
parece production-ready por estilo (comentarios, docstrings, estructura
coherente con resto del codebase).

---

## Histórico 2026-04-18 (46 commits)

### Sesión 1 — Fases 1.2→2→3→5 (commits 1-20)
Fase 1.2 cleanup (28 .js stubs) → Fase 2 Work completa → Fase 3 Me/Moves/Money → Fase 5 Topbar + keyboard shortcuts + toasts → PWA manifest. Reviews: `session_close_2026_04_18_react_phases_2_3_5.md`.

### Sesión 2 — Maratón continuo (commits 21-46)
Bajo mandato "10h sin parar" con control total para commit+push:

**Cross-pilar features:**
- Unified MatchCard (opps + jobs) con visa cross-ref
- Compliance timeline (docs + tax + vaccines + memberships)
- Money cross-pilar (NW sparkline + markets + FX)
- Moves POIs (46K cached)
- World MVP (KPIs + continents + spikes + news feed + article reader fulltext+translate + compare countries + intelligence brief)

**UX infra:**
- Cmd+K palette + fuzzy + 17 items (nav + actions)
- Global Toast system (success/error/info)
- ErrorBoundary global
- TopBar user menu (avatar + logout)
- MustDoBadge floating (live count)
- Auto-refresh on visibility change
- 401 redirect to login

**Quick-add modales:**
- MoodLogModal (3 sliders)
- LogisticsAddModal (7 campos + type pills)
- ExpenseAddModal (toggle expense/income + 12 cats)
Todos con URL `?action=` para apertura vía palette.

**Backend:**
- /api/home/overview aggregator + 7 domain modules + cache 30-60s + invalidación on POST
- /api/jobs/search-local con min_score/q/country/visa/remote/status
- /api/logistics/upcoming window 7d → 90d + ?days=

**Tests:**
- Web: 55 → 106 (HomePage, MatchCard, WorkPage, MePage, MovesPage, MoodLogModal, LogisticsAddModal, ExpenseAddModal, CommandPalette, MeTimeline, MovesUpcomingActions, MoneyPage, WorldPage, WorldCompare, ArticleReader, ErrorBoundary, Toast, TopBar, useSection, uikit)
- Backend: 7 → 15 (+ jobs-search-local 8)

**Perf:**
- memo() MatchCard
- Cache TTLs 30-60s + invalidación selectiva
- Auto-refetch on tab visibility

### Propuestas commits (todos ya pusheados)
`git log --oneline` muestra histórico completo. `master` al día con origin.
