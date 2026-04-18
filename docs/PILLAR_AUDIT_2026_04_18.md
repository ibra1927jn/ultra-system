# Pillar audit — 2026-04-18

Snapshot del estado de cada pilar para guiar el rediseño React (Fases 2-5).
Enfoque "innovar no apilar": qué datos existen, qué NO se surface, qué conexiones cross-pilar desbloquean valor real.

## Me (Bio + Bureaucracy + Docs)

| Tabla | Rows | Estado |
|---|---|---|
| `bio_checks` | 0 | **Tabla existe, usuario no loggea** → UX gap: falta flujo mobile dead-simple |
| `health_alerts` | 113 | scrapers WHO/CDC/ECDC funcionando |
| `document_alerts` | 1 | solo NZ Self-Contained Warrant · **usuario tiene 2 pasaportes + visas que NO están tracked** |
| `bur_tax_deadlines` | 137 | seed + auto-roll ES/NZ/AU/EU cargado |
| `bur_vaccinations` | 1 | solo 1 vacuna registrada |

**Innovación posible (para Fase 3 Me):**
- Ingesta automática via paperless-ngx (hay container corriendo): OCR → extraer expiry → insert en document_alerts sin que el usuario haga nada.
- Bio-check micro-log: 3 sliders (sleep/energy/mood) en 5 segundos desde mobile. Correlar con `logistics.date` (días de viaje) y `wm_news` país-nivel (brotes cerca).
- Cross-pilar: `bur_tax_deadlines` + `logistics` → advertir si un movimiento cae dentro de una ventana fiscal crítica (183d ES, NZ residency).

## Work

| Tabla | Rows | Estado |
|---|---|---|
| `opportunities` | 11,977 | 3,182 high-score (≥8), 11,975 status='new' (pipeline no usado) |
| `job_listings` | 13,577 | 688 high-score, 11,264 last 7d (scrapers activos) |
| `emp_visa_sponsors` | 7,018 | 15 países (CA 6616, DE 270, AU 60, NL 39, SE 14) |
| `emp_tracked_companies` | 44 | usuario rastrea 44 empresas |
| `emp_listings` | 0 | placeholder vacío |

**UI actual:** card pequeño en index.html · ~10 items visibles · no pipeline visible.

**Innovación posible (Fase 2, esta sesión):**
- **Cross-ref sponsor × job**: filter jobs en AU/CA/NL/DE/SE donde `company` esté en `emp_visa_sponsors` → lista curada "puedo aplicar y la visa está desbloqueada".
- **Pipeline real**: 11,975 con status='new' es señal de que pipeline NO se usa. Kanban-ish UI con drag-to-move (new→saved→applied→interview→offer/rejected).
- **Match evolution**: "mientras estabas offline entraron N matches ≥8" (badge en nav).

## Money

| Tabla | Rows | Estado |
|---|---|---|
| `finances` | 67 | solo 67 txns totales (user no importó CSVs completos aún) |
| `budgets` | 13 | envelope van-life cargado |
| `fin_recurring` | 7 | detector funcionando |
| `fin_net_worth_snapshots` | 13 | 13 días de NW histórico |

**UI actual:** /money.html **crown jewel** (14 paneles, 6 workspaces, 3500 LOC). Sólido.

**Gap crítico:** solo 67 transacciones — Money Cockpit está listo para mucho más. Falta ingesta real.

## Moves (Logistics)

| Tabla | Rows | Estado |
|---|---|---|
| `logistics` | 0 | **Vacío**. Usuario no proyecta movimientos. |
| `log_pois` | 46,554 | Overpass + DOC NZ campsites cacheados |
| `log_memberships` | 4 | Workaway/HelpX/MindMyHouse/WWOOF |

**UI actual:** card pequeño en index.html.

**Innovación posible (Fase 3 Moves):**
- Timeline proyectado: WHV NZ expira → next hop (AU WHV? ES residency reset?) con visa rules + flight prices + weather window.
- Mapa de POIs campsites + water + dump station (ya en DB) con filtro "free + has_water".

## World (News + WorldMonitor + Markets)

| Tabla | Rows | Estado |
|---|---|---|
| `rss_articles` | 411,902 | Saludable. Last 24h probado en /api/wm/*. |
| `rss_feeds` | 1,480 | Expansión profunda previa (124 países, 28 idiomas). |

**UI actual:** /worldmap.html **feature-rich** (20 workspaces, cmdk, reader, compare, search FTS, 39 endpoints). Sólido.

**Para Fase 4 World:** el brief dice separar overview/map(calm)/deep y eliminar Trader mode. Re-arquitecturar sin perder capacidades.

---

## Conclusión cross-pillar

El problema no es falta de datos — es falta de **surfacing** y **conexiones**.

- 11,977 opportunities guardadas · 0 pipeline real usado
- 7,018 visa sponsors · no cross-referencia con job_listings
- 46,554 POIs · no visualizados
- 137 tax deadlines · no conectados con logistics.date
- 411K articles + health_alerts · no cross-ref con ubicación actual del usuario

**Prioridad de ataque (Fases 2-5):**
1. **Fase 2 Work** → pipeline + visa×jobs cross-ref
2. **Fase 3 Me** → auto-ingesta docs + bio micro-log mobile
3. **Fase 3 Money** → importer UX (ya 18 endpoints listos, solo falta que el user use los CSVs)
4. **Fase 3 Moves** → timeline proyectado + POI map
5. **Fase 4 World** → re-arch en 3 modos (overview/map/deep)
6. **Fase 5** → topbar + sidebar + Cmd+K global + atajos g+h/g+w/...
