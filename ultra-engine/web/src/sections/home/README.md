# Home

Sección raíz de la SPA (`/app/`). Portada de decisión: "must-do" de hoy + 5 tarjetas de sección.

## Endpoints que consume
- `GET /api/home/overview` → `{ mustDo[], me, work, money, moves, world }`

## Estado interno
- `useHomeOverview()` → `loading | ok | error`. Una sola llamada al montar, sin polling.

## Tests
- `src/test/HomePage.test.tsx` — smoke render (muestra título + 5 tarjetas de sección).

## Pendiente (sub-fases siguientes)
- Componentes reales `<HomeCard>` (KPI + badge + CTA) y `<MustDoStrip>` (≤3 items, colorizado).
- Poblar el endpoint con datos reales agregando los resúmenes de los 13 routers existentes.
