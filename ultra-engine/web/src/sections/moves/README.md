# moves/ — Sección Moves (Fase 3)

Viajes, campings, membresías, POIs. Flow primario para nómada planificando
vuelos/visas/citas con meses de antelación.

## Ruta
`/app/moves` con 4 sub-tabs:
- `/app/moves` (overview) — 4 KPIs + próximos 48h
- `/app/moves/upcoming` — lista completa 90d + add/confirm/done inline
- `/app/moves/memberships` — Workaway/HelpX/WWOOF-NZ/MindMyHouse con renew countdown
- `/app/moves/poi` — POIs cerca con geolocation + 5 presets + filtros

## Archivos
- `types.ts` — 4 schemas (LogisticsItem, Next48h, Membership, Poi)
- `useMovesData.ts` — 3 hooks (useUpcoming, useNext48h, useMemberships)
- `MovesPage.tsx` — shell con TabNav
- `MovesOverview.tsx`, `MovesUpcoming.tsx`, `MovesMemberships.tsx`, `MovesPoi.tsx` — tabs
- `LogisticsAddModal.tsx` — drawer quick-add (4 types × 3 statuses)

## Endpoints consumidos
- `GET /api/logistics/upcoming?days=90` (window extendida 7d → 90d)
- `GET /api/logistics/next48h`
- `GET /api/logistics/memberships`
- `GET /api/logistics/poi?lat=X&lon=Y&radius_km=Z&type=...`
- `POST /api/logistics` (add modal)
- `PATCH /api/logistics/:id` (confirm + done inline buttons)

## POI presets
Auckland, Madrid, Barcelona, Sydney, Queenstown + geolocation nativa.
Tipos: campsite, drinking_water, dump_station, shower, toilets, fuel.

## Deuda técnica
- Edit completo (title/date/cost/notes) pendiente — solo status ahora
- DELETE endpoint no existe
- POI map visual diferido (Leaflet o SVG choropleth)
- Kiwi flights integration (stub en backend) sin UI
