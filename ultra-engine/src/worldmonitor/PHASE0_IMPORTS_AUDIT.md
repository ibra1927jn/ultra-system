# WM Phase 0 — Imports audit

Generated 2026-04-08 durante la absorción inicial de WorldMonitor (OSINT Monitor v2.5.5) en `ultra-engine/src/worldmonitor/`.

## Scaffold
- **153 archivos TS** copiados desde `/tmp/worldmonitor/`:
  - `services/` ← `/tmp/worldmonitor/src/services/` (~80 archivos top-level + subdirs por dominio)
  - `domains/` ← `/tmp/worldmonitor/server/worldmonitor/` (17 dominios verticales)
- Tamaño en disco: ~1.7 MB
- Frontend (vite/tauri/convex/playwright/locales/api/generated/config) **NO copiado** — está fuera del scope del Pilar 1.

## Imports a resolver en Phase 1+

Los archivos TS dependen de las siguientes resoluciones que aún NO existen en el destino. Cualquier `require('./worldmonitor/services/X.ts')` en código no canario fallará hasta cubrir lo que use.

### Path aliases (@/...) — el repo original usaba `vite` + `tsconfig.paths` con `@/* → src/*`

| Alias | Status | Acción Phase 1 |
|---|---|---|
| `@/types`, `@/types/social`, `@/types/social-pulse` | ❌ no existe | Crear `worldmonitor/types/index.ts` con stubs de NewsItem, ClusteredEvent, etc. |
| `@/config` (barrel + 13 submódulos: bases-expanded, beta, countries, entities, feeds, geo, military, ml-config, pipelines, ports, startup-ecosystems, tech-companies, tech-geo) | ❌ no copiado | Copiar `/tmp/worldmonitor/src/config/` → `worldmonitor/config/` (Phase 1) |
| `@/services/*` (climate, displacement, earthquakes, i18n, prediction, runtime, social, tauri-bridge) | ⚠️ parcial | Algunos coinciden con archivos en `services/` (nuestro), otros referencian al frontend (tauri-bridge, i18n). Resolver caso por caso. |
| `@/utils`, `@/utils/analysis-constants` | ❌ no copiado | Copiar `/tmp/worldmonitor/src/utils/` (Phase 1) |
| `@/workers/analysis.worker?worker`, `@/workers/ml.worker?worker` | ❌ Vite-specific | El sufijo `?worker` es magia de Vite. En Node hay que reemplazar por `worker_threads` directos o stubear como no-op. |
| `@/generated/client/worldmonitor/{displacement,infrastructure,maritime,news,prediction}/v1/service_client` | ❌ no copiado | Generated proto clients. Phase 2 — solo necesario si usamos los RPC handlers (`server/worldmonitor/<domain>/`). Por ahora stubear o no importar. |

### Imports relativos rotos

| Import | Origen | Acción |
|---|---|---|
| `../../../../api/data/city-coords` | un servicio dentro de `services/` apunta a `api/data/`. NO copiado. | Crear stub o copiar JSON minimal. |
| `../runtime-config` | apunta a `src/runtime-config.ts` fuera de `services/`. NO copiado. | Copiar archivo o crear stub. |
| `../locales/en.json` | apunta a `src/locales/en.json` fuera de `services/`. NO copiado. | Copiar JSON o stubear. |
| `../data-freshness` | apunta a `src/data-freshness.ts` fuera. NO copiado. | Copiar archivo o stubear. |

### Paquetes npm faltantes en `ultra-engine/package.json`

| Paquete | Usado por | Phase 1 acción |
|---|---|---|
| `fast-xml-parser` | parsers de feeds RSS/Atom | añadir a deps |
| `geojson` | servicios geo (focal-point-detector, country-geometry, etc.) | añadir a deps (es solo tipos, podría ser devDep) |
| `i18next` + `i18next-browser-languagedetector` | i18n del frontend | NO añadir — el i18n era solo para el dashboard React de WM, no aplica a backend |

## Estado Phase 0 al cierre 2026-04-08

✅ Scaffold copiado (153 archivos)
✅ `tsx@^4.19.2` añadido a `dependencies` de `ultra-engine/package.json`
✅ `typescript@^5.7.2` añadido a `devDependencies`
✅ `Dockerfile` actualizado: `CMD ["node", "--require", "tsx/cjs", "server.js"]`
✅ Tabla `wm_cache(cache_key TEXT PK, value JSONB, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ)` creada en `ultra_db` con índice por `expires_at`
✅ Audit de imports rotos completado (este archivo)
✅ Canario `_phase0_canary.ts` creado para smoke test del require hook
🔜 Pendiente: rebuild engine + validar que `require('./worldmonitor/_phase0_canary').phase0Hello()` retorna `{ok:true}` desde dentro del container

## Phase 1 — orden de trabajo recomendado

1. **Copiar `src/config/`, `src/types/`, `src/utils/` enteros** desde `/tmp/worldmonitor` (no hay imports rotos hacia el frontend en estos)
2. **Añadir `tsconfig.json` en `worldmonitor/`** con `paths: { "@/*": ["./*"] }` para que tsx resuelva los aliases
3. **Stubear** `@/workers/*?worker` (cambiar a `worker_threads` reales o no-op si no se usa pipeline ML)
4. **Stubear** `@/generated/client/*` con barrels vacíos hasta Phase 2 (donde se decida si los RPCs se exponen)
5. **Añadir** `fast-xml-parser` y `geojson` a `dependencies`
6. **Smoke test** de un servicio canónico (`clustering.ts`, `analysis-core.ts`) — debería compilar y ejecutar `clusterNews([])` sin errores

Una vez los servicios "core" arranquen, Phase 2 (cablear scheduler con bridges a tablas existentes) puede empezar.
