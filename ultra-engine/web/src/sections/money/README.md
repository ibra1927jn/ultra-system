# money/ — Sección Money (thin wrapper + quick-add)

Versión ligera para la SPA. El cockpit completo vive en `/money.html`
(14 paneles, 3500 LOC). Esta sección da los 4 KPIs + panorámica macro +
CTA al cockpit.

## Ruta
`/app/money` — vista única (no sub-tabs). Modal `?action=add` abre
ExpenseAddModal.

## Archivos
- `types.ts` — 5 schemas Zod (Summary, Runway, NwTimeline, MarketsSnapshot, Fx)
- `MoneyPage.tsx` — vista principal
- `ExpenseAddModal.tsx` — drawer quick-add (expense|income toggle)

## Contenido
1. **4 KPIs** (StatBlock grid): balance mes · runway días · burn 90d · NW.
2. **NW sparkline** últimos 30d cuando hay ≥2 snapshots + delta%.
3. **Markets snapshot** (cross-pilar con `/api/wm/markets/snapshot`) —
   4 índices (DOW/SPX/NDX/VIX) color-coded por change_pct.
4. **FX base NZD** — 6 quotes cacheados (Frankfurter/fawazahmed).
5. **Top expense categories** mes actual.

## Endpoints consumidos
- `GET /api/finances/summary`
- `GET /api/finances/runway`
- `GET /api/finances/nw-timeline?days=30`
- `GET /api/wm/markets/snapshot` (cross-pilar money↔world)
- `GET /api/finances/fx`
- `POST /api/finances` (desde ExpenseAddModal)

## Deuda técnica
- No hay pagination para top categories (se muestran top 5)
- No hay drill-down al click en una categoría — queda para migración full
- Bridge Firefly III funciona si `FIREFLY_PERSONAL_TOKEN` está env, invisible al user
