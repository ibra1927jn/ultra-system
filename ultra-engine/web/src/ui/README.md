# UI kit (Fase 2.1)

Componentes compartidos para las páginas de sección lite (Fase 2). Solo presentación; no conocen datos ni endpoints.

| Componente | Responsabilidad | Props clave |
|---|---|---|
| `SectionShell` | Layout estándar de página: header (title/subtitle/actions) + children | `title`, `subtitle?`, `actions?`, `children`, `testId?` |
| `StatBlock` | KPI grande + label + dot por badge | `kpi`, `label?`, `badge?`, `priorityScore?`, `testId?` |
| `ListRow` | Fila genérica. Renderiza `<a>`/`<button>`/`<div>` según props | `title`, `subtitle?`, `icon?`, `trailing?`, `href?`, `onClick?`, `external?`, `testId?` |
| `EmptyState` | "Nada que mostrar" centrado, dashed border | `title`, `description?`, `icon?`, `testId?` |
| `ErrorState` | Mensaje rojo + botón reintentar opcional | `message`, `onRetry?`, `testId?` |
| `LoadingState` | Skeleton para variant `list` o `card` | `rows?`, `variant?`, `testId?` |

## Hook complementario

`web/src/lib/useSection.ts` — `useSection<T>(endpoint, schema)` valida con Zod el envelope `{generatedAt, partial, data}` y devuelve `{status, data, partial, generatedAt, error, refetch}`.

## Convenciones

- Cada componente hace UNA cosa; max 8 props; max ~80 líneas por archivo.
- Lógica de negocio fuera (los componentes son presentacionales).
- Colores vía tokens Tailwind (`fg-muted`, `accent`, `critical`, `attention`, `border`).
- Cada componente expone `testId?` para tests/automation.
- Accesibilidad: roles (`alert`, `status`), `aria-busy`, `aria-hidden` en decorativos.
- ListRow externa SIEMPRE con `target=_blank rel=noopener noreferrer`.

## Demo visual

`/app/__uikit` (ruta oculta, requiere sesión) renderiza una story de cada componente con sus estados.
