# me/ — Sección Me (Fase 3)

Salud + documentos + burocracia (compliance-heavy para nómada digital).

## Ruta
`/app/me` → overview. Sub-rutas:
- `/app/me` — Overview (5 KPIs + top docs + top tax)
- `/app/me/docs` — Documentos + vacunas + todos los deadlines fiscales
- `/app/me/bio` — Schengen + mood log

## Archivos
- `types.ts` — 5 schemas Zod (Document, TaxDeadline, Vaccination, Schengen, Mood)
- `useMeData.ts` — hooks: `useDocuments`, `useTaxDeadlines`, `useVaccinations`, `useSchengen`, `useRecentMood`
- `MePage.tsx` — shell + TabNav
- `MeOverview.tsx`, `MeDocs.tsx`, `MeBio.tsx` — 3 tabs

## Endpoints consumidos (sin nuevos backend)
- `GET /api/documents` → document_alerts
- `GET /api/bureaucracy/tax-deadlines`
- `GET /api/bureaucracy/vaccinations`
- `GET /api/bureaucracy/schengen`
- `GET /api/bio/mood?limit=N`

## Patrón reutilizado de Work
- `TabNav` nav horizontal URL-driven
- `StatBlock`, `ListRow`, `EmptyState`, `ErrorState`, `LoadingState`
- `SectionShell` con title + subtitle

## Bug notable durante Fase 3
`useEndpoint` con closures no estables causaba infinite re-render loop (tests quedaban colgados). Fix: `useSchemaEndpoint` deps solo en `path` (string), schema via `useRef` estable al ser importado a nivel módulo.

## Deuda técnica anotada
- Paperless-ngx tiene OCR corriendo pero `document_alerts` solo tiene 1 row. Falta un cron que lea `paperless` → extraiga expiry → INSERT en document_alerts.
- bio_checks tiene 0 rows. Un flow móvil one-tap para registrar (mood/energy/sleep) cerraría el loop.
- `useRecentMood` devuelve `data.count` pero no calcula avg — cuando haya >10 entries, añadir chart en MeBio.
