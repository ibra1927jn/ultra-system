# world/ — Sección World (Fase 4 MVP)

Panorama global de noticias + signals + salud + comparativas. Fase 4
completa (map interactivo) queda pendiente; esta vista MVP es rica pero
sin mapa. CTA legacy → `/worldmap.html` siempre visible.

## Ruta
`/app/world` — vista única con 6 bloques verticales.

## Archivos
- `types.ts` — NewsPulseSchema + HealthAlertsSchema
- `WorldPage.tsx` — layout con CTA legacy
- `WorldNews.tsx` — feed filtrable (search + topic + hours)
- `WorldIntel.tsx` — convergence zones + top signal countries (intelligence-brief)
- `WorldCompare.tsx` — 9 presets toggle, hasta 4 países side-by-side
- `ArticleReader.tsx` — drawer con summary + entities + sentiment + fulltext + translate

## Contenido
1. **4 KPIs** (h1 articles, h24, topic spikes, health alerts)
2. **Top por continente** (6) + **Topic spikes** (6) — 2-col grid
3. **Intelligence brief** — convergence zones + top 5 signal countries
4. **Compare countries** — 1-4 cards side-by-side con sparkline + top article
5. **News feed filtrable** — search/topic/hours, click → ArticleReader drawer
6. **Health alerts** — WHO/CDC/ECDC últimas 5

## Endpoints consumidos
- `GET /api/wm/news/pulse`
- `GET /api/wm/intelligence-brief`
- `GET /api/wm/compare?isos=A,B,C&hours=48`
- `GET /api/wm/news/filtered?hours&topics&search`
- `GET /api/wm/article/:id` (reader metadata)
- `GET /api/wm/article/:id/fulltext` (reader on-demand scrape)
- `POST /api/wm/translate` (reader on-demand translate)
- `GET /api/bio/health-alerts?limit=5`

## Deuda técnica (ver BLOCKERS)
- Leaflet/SVG choropleth map pendiente — Fase 4 completa
- Multi-language translate persistent (ahora se pierde al cerrar drawer)
- Article reader no marca "read" — no hay tracking de consumo
