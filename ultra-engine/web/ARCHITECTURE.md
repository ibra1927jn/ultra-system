# Web SPA — Arquitectura

React 18 + Vite + TypeScript estricto + Tailwind, montada en `/app/*` del
mismo Express que sirve los legacy dashboards (`/`, `/worldmap.html`,
`/money.html`). Cookie JWT via `requireAuth`.

## Stack

- **React 18** con Router v6 (basename `/app`). Composición Outlet + lazy.
- **TypeScript estricto**: `noEmit`, `exactOptionalPropertyTypes`, `noUnusedLocals`.
- **Tailwind** con tokens de brief: `bg-base/panel/elev`, `fg/-muted/-dim`,
  `accent` (cyan-green), `attention` (ámbar), `critical` (rojo), `border`.
- **Zod** para validar respuestas de API (sin drift silencioso).
- **Vitest** + Testing Library jsdom — 91 tests al cierre de sesión.

## Layout top-level

```
web/
├─ src/
│  ├─ App.tsx            ToastProvider → TopBar + ErrorBoundary<Outlet> + CommandPalette
│  ├─ router.tsx         Rutas con basename='/app', todas las secciones con /*
│  ├─ main.tsx           ReactDOM.render(RouterProvider)
│  ├─ styles/globals.css Tailwind base + dark por defecto
│  ├─ i18n/{es,t}.ts     Mensajes ES → helper t() tipado
│  ├─ lib/
│  │  ├─ api.ts          apiFetch(path, schema) — cookie auth + Zod parse + 401 redirect
│  │  ├─ useEndpoint.ts  Hook genérico para endpoints con schema (refetch, abort)
│  │  ├─ useKeyboardNav  Chord g+letra para nav (g+h, g+w, g+m, etc.)
│  │  ├─ useSection.ts   Envelope {generatedAt, partial, data} pattern
│  │  ├─ fuzzy.ts        Subsequence matcher para Cmd+K palette
│  │  └─ zod-schemas.ts  Schemas para /api/home/overview
│  ├─ sections/
│  │  ├─ home/           5 HomeCard + MustDoStrip (items clicables a SPA routes)
│  │  ├─ me/             overview + timeline + docs + bio (+ MoodLogModal)
│  │  ├─ work/           overview + matches (opps|jobs toggle) + pipeline kanban
│  │  │                   + MatchCard (MatchLike unified) + DetailDrawer actions
│  │  ├─ money/          thin wrapper — 4 KPIs + NW sparkline + markets + FX
│  │  │                   + ExpenseAddModal quick-add
│  │  ├─ moves/          overview + upcoming (CRUD) + memberships + poi (geoloc)
│  │  │                   + LogisticsAddModal
│  │  ├─ world/          volume KPIs + continents + spikes + health
│  │  │                   + WorldNews filtered feed + ArticleReader (fulltext+translate)
│  │  └─ __uikit/        playground de componentes
│  ├─ ui/                Kit reusable:
│  │  ├─ SectionShell    Layout título + actions + main
│  │  ├─ TabNav          Sub-nav horizontal URL-driven
│  │  ├─ HomeCard        Card de sección con KPI + badge + preview (3 items)
│  │  ├─ MustDoStrip     5 items cross-pillar con Link a SPA
│  │  ├─ MatchCard       Card opp|job unified (via MatchLike adapter)
│  │  ├─ DetailDrawer    Slide-in panel ESC-closable
│  │  ├─ CommandPalette  Cmd+K + "/" fuzzy search
│  │  ├─ TopBar          Brand + nav + palette button + user menu
│  │  ├─ Toast           ToastProvider + useToast (success/error/info)
│  │  ├─ ErrorBoundary   Fallback si un component crashea en render
│  │  ├─ Sparkline       SVG inline, series arbitrarias
│  │  ├─ StatBlock/ListRow/EmptyState/ErrorState/LoadingState  primitives
│  └─ test/              Vitest + jsdom, fetch mocked por archivo
├─ public/
│  ├─ manifest.webmanifest   PWA install
│  └─ favicon.svg            Inline 32×32
├─ index.html                meta PWA + manifest link
└─ vite.config.ts            build outDir → ultra-engine/public/app
```

## Flujos clave

1. **Login** → cookie JWT → cada fetch lleva `credentials:'include'`.
   Si expira → 401 → `api.ts` redirige a `/login.html` (debounced).

2. **Home** = `/api/home/overview` (aggregator Promise.allSettled sobre 7
   domain modules, TTL cache 30-60s invalidado en POST mood/finances/
   logistics). Cada section card recibe `{status, kpi, badge, preview}` —
   nunca falla global, solo `partial: true` si alguna sección cayó.

3. **Work/Matches** — toggle Opps|Jobs → 2 hooks distintos
   (`useOpportunities`, `useJobs`) → adapter `oppToMatch`/`jobToMatch` →
   MatchCard. Filtro `visa=true` cruza `emp_visa_sponsors` en backend.

4. **Cmd+K palette** — 17 items (14 navigation + 3 actions con `?action=`
   URL params que los modales auto-abren con `useSearchParams`).

5. **Quick-add modales** — mood (3 sliders) / logistics (formulario 7
   campos) / expense (toggle expense|income, 6 currencies, 12 cats).
   Todos POST → toast success + refetch + cache invalidation.

6. **Article reader** — click en news feed → `/api/wm/article/:id`
   (summary + entities + sentiment) → botón "cargar texto completo"
   (`/fulltext` scrape via trafilatura + summarize via ultra_nlp) +
   "traducir" (`/translate` 5 langs).

## Compatibilidad con legacy

Las 3 páginas legacy siguen intactas y servidas por el mismo Express:
- `/` Mission Control original (vanilla HTML/JS)
- `/worldmap.html` WorldMonitor completo (180KB, Leaflet + 20 workspaces)
- `/money.html` Money Cockpit (14 paneles)

La SPA `/app/*` no las sustituye — las complementa. `MoneyPage` y
`WorldPage` en SPA incluyen CTAs explícitos al legacy cockpit para
features que no se han migrado (mapa interactivo, drag-drop CSV import,
receipt OCR, etc.).

## Deuda técnica (ver BLOCKERS.md del root)

- Fase 4 World real (mapa Leaflet) pendiente — `/app/world` es MVP con
  KPIs + listas, CTA al cockpit.
- Edit logistics (PATCH fields) — solo status done/confirmed por ahora.
- Jobs/opps pipeline drag-drop — click en drawer cambia status, no DnD.
- PWA icons PNG 192/512 — placeholder, manifest lista SVG fallback.
- A11y: focus trap en DetailDrawer (ESC funciona, tab-cycling no).
- Performance: React.memo en MatchCard/ListRow sobre listas >50 items.
