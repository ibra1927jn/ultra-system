# BLOCKERS.md — Intervención del usuario requerida

Lista viva de cosas que necesitan al usuario. Yo sigo trabajando en lo que puedo avanzar sin ellas.

**Formato:** `[YYYY-MM-DD HH:MM] · prioridad · descripción · cómo desbloquear`

Última actualización: 2026-04-18 03:26 tras 18 commits autónomos pusheados.

---

## 🔴 Pendientes de aprobación humana / decisión estratégica

_ninguno crítico. 18 commits pusheados con autoridad concedida 2026-04-18 ("tienes control total, mientras no la cagues")._

---

## 🟡 Deuda técnica priorizada (no bloquean user, son fases siguientes)

### [2026-04-18 03:26] · alta · Fase 4 World — re-arch worldmap en React
Brief dice overview/map-calm/deep + eliminar Trader mode + cluster dedup + anti-SEO filter en `config/news-blocklist.yml`. El worldmap.html (180KB legacy) funciona bien; re-arch React es ~1-2 semanas de trabajo (mapa Leaflet, 39 endpoints, 20 workspaces, cmdk, reader, compare…). Actualmente /app/world es un dashboard MVP con volume KPIs + top continente + spikes + health — útil pero no reemplaza el cockpit.

### [2026-04-18 03:26] · media · Jobs status PATCH desde drawer
WorkPage drawer actualmente oculta status actions cuando el match es un Job (sólo funciona con Opportunity). Añadir `PATCH /api/jobs/:id/status` call + UI. Backend ya existe en `/api/jobs/:id/status` con whitelist ['new','saved','applied','rejected'].

### [2026-04-18 03:26] · media · PWA icons reales (192 + 512 PNG)
manifest.webmanifest referencia /app/icon-192.png y icon-512.png — aún no existen. Generar desde favicon.svg o crear dedicados (actualmente apple-touch-icon usa el SVG como fallback, pero Android espera PNG). Tool sugerida: pwa-asset-generator o manual con ImageMagick.

### [2026-04-18 03:26] · baja · Paperless → document_alerts cron (ya existe)
Cron `paperless-ocr-sync` corre cada 6h :40 en scheduler.js línea 197. User solo tiene 1 doc en paperless ahora, por eso no se ve efecto. Cuando suba pasaporte/visa/seguros → automáticamente aparecerán en document_alerts + /app/me/docs. No hay nada que hacer hasta que el usuario suba docs.

### [2026-04-18 03:26] · baja · Tests de coverage
De los 55 tests en suite, cubren: HomePage, MatchCard, WorkPage, MePage, MovesPage, MoodLogModal, CommandPalette, MeTimeline, useSection, uikit. NO cubiertos aún: MoneyPage, WorldPage, LogisticsAddModal, ExpenseAddModal, MovesPoi (POI), useKeyboardNav. Añadir sistemáticamente.

### [2026-04-18 03:26] · baja · Accessibility sweep
aria-live en modales tras submit, focus trap en DetailDrawer (ESC funciona, tab-cycling no), contraste AA verificado visualmente pero no con axe-core. Brief R9 exige.

### [2026-04-18 03:26] · baja · Logout / session management
No hay botón de logout en la SPA aún. Usuario siempre autenticado via cookie JWT (90 días). Si comparte dispositivo, problema.

---

## 🟢 Otros cambios pre-existentes sin commitear (no míos)

Detectados en `git status` al empezar la sesión, **no tocados por mí**:
- `?? CHANGELOG.md` — P0 hardening docs (referencian P0-1.3/1.5/1.8 ya implementados)
- `?? ultra-engine/src/country_detect.js` — normalizador de países para job scrapers
- `?? ultra-engine/src/jobspy_massive.js` — JobSpy massive multi-site scraper (1500-2500 jobs/run)
- `?? ultra-engine/src/routes/admin.js` — admin router (P0-1.3 split de /api/status)

Ninguno está mounted en server.js ni importado desde ningún archivo. **Cómo desbloquear:** decidir si commiteo estos (verificar que funcionan) o los borras como scratchpad.

---

## Histórico (resuelto esta sesión)

- ✅ Commit + push Fase 1.1 + 1.2 + 2 + 3 + 5 → DONE (18 commits pusheados autónomos).
- ✅ TSC-EMIT-LEAK (.js stubs stale en src/) → DONE con noEmit + src/**/*.js gitignore.
- ✅ Cmd+K palette → DONE con fuzzy + 14 nav items + 3 quick actions (log mood, add expense, add move).
- ✅ Jobs surfaced en Work/Matches + visa sponsor cross-ref → DONE (13.5K jobs + 7K visa sponsors ahora unificados en MatchCard con badge "visa ok").
- ✅ Mood micro-log mobile → DONE (3 sliders + notas + submit → POST /api/bio/mood 201).
- ✅ Logistics quick-add → DONE.
- ✅ Expense/income quick-add → DONE.
- ✅ POIs en Moves (46K cached ahora visibles) → DONE con geolocation + 5 presets + filters.
- ✅ Compliance timeline (Me · docs + tax + vaccines + memberships) → DONE.
- ✅ Money cross-pilar (NW sparkline + markets + FX) → DONE.
- ✅ World MVP dashboard → DONE (volume + continentes + spikes + health).
- ✅ PWA manifest + favicon → DONE (install to home screen ok iOS/Android).
- ✅ Palette quick-action shortcuts via ?action= URL params → DONE.
