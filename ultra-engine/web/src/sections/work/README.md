# work/ — Sección Work (Fase 2)

Reemplaza el card "Employment" de `index.html` por una SPA section completa.

## Ruta
`/app/work` → redirige a `/app/work` (overview). Sub-rutas:
- `/app/work` — Overview (KPIs + featured + follow-up + deadlines)
- `/app/work/matches` — Feed filtrable (score/search/status)
- `/app/work/pipeline` — Kanban 5 columnas con conversion rates

## Archivos
- `types.ts` — Zod schemas (Opportunity, Pipeline, HighScore)
- `useWorkData.ts` — hooks `useOpportunities`, `useHighScoreOpps`, `usePipeline` + `updateOpportunityStatus`
- `WorkPage.tsx` — shell + TabNav + DetailDrawer con status actions
- `WorkOverview.tsx` — tab 1
- `WorkMatches.tsx` — tab 2
- `WorkPipeline.tsx` — tab 3

## Endpoints consumidos
- `GET /api/opportunities?min_score&status&q&category&limit` — filtrable
- `GET /api/opportunities/pipeline` — stats kanban + rates + follow_up + deadlines
- `GET /api/opportunities/high-score` — featured score≥8
- `PATCH /api/opportunities/:id` — cambiar status (desde el drawer)

## Backend touched
`src/routes/opportunities.js` — añadidos query params `min_score` y `q` al GET `/` (rompen nada, clientes previos siguen funcionando). Filtro `duplicate_of IS NULL` ahora siempre activo.

## Componentes ui/ nuevos (reutilizables en Fase 3)
- `TabNav` — sub-nav URL-driven
- `MatchCard` — card con score + salary + tags + click → open
- `DetailDrawer` — slide-in panel (ESC + overlay close)

## Decisiones de scope
- Solo `opportunities` en Matches (no `job_listings`). Jobs se mergean en follow-up.
- Drag-to-move en Pipeline descartado para MVP (click → drawer → botones status).
- Sin cross-ref `emp_visa_sponsors` aún (anotado como oportunidad en PILLAR_AUDIT_2026_04_18.md).
