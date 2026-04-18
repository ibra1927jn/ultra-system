import { z } from 'zod';
import { useEndpoint } from '@/lib/useEndpoint';
import { ErrorState } from '@/ui/ErrorState';

const ConvergenceZoneSchema = z.object({
  region: z.string(),
  countries: z.array(z.string()),
  description: z.string(),
  signalTypes: z.array(z.string()),
  totalSignals: z.union([z.number(), z.string()]),
}).passthrough();

const TopCountrySchema = z.object({
  country: z.string(),
  countryName: z.string(),
  totalCount: z.union([z.number(), z.string()]),
  signalTypes: z.array(z.string()).optional(),
}).passthrough();

const IntelBriefSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    signal_context: z.string().nullable().optional(),
    convergence_zones: z.array(ConvergenceZoneSchema).default([]),
    top_countries: z.array(TopCountrySchema).default([]),
  }).passthrough(),
}).passthrough();

const SIGNAL_EMOJI: Record<string, string> = {
  military_flight: '✈️',
  military_vessel: '🚢',
  satellite_fire: '🔥',
  outage: '⚡',
  earthquake: '🌍',
};

function toNum(v: number | string): number {
  return typeof v === 'number' ? v : parseInt(v, 10) || 0;
}

// Surface convergence zones + top countries por signal activity.
// Datos del backend /api/wm/intelligence-brief (military flights + satellite
// fires + vessels + outages) que el worldmap.html legacy ya muestra como
// "global situation report". Aquí versión compacta para el SPA.
export function WorldIntel() {
  const brief = useEndpoint('/api/wm/intelligence-brief', IntelBriefSchema);

  if (brief.status === 'loading') return null;
  if (brief.status === 'error') {
    return (
      <section className="mt-6" aria-label="intelligence-brief">
        <ErrorState message={brief.error} />
      </section>
    );
  }

  const zones = brief.data.data.convergence_zones ?? [];
  const countries = (brief.data.data.top_countries ?? []).slice(0, 5);

  if (zones.length === 0 && countries.length === 0) return null;

  return (
    <section className="mt-6 space-y-4" aria-label="intelligence-brief">
      <h2 className="text-card-title text-fg-muted">
        Intelligence brief <span className="text-fg-dim">· convergencia global</span>
      </h2>

      {zones.length > 0 && (
        <div
          data-testid="world-intel-zones"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {zones.map((z) => (
            <div
              key={z.region}
              data-testid={`intel-zone-${z.region.replace(/\s+/g, '-')}`}
              className="rounded-lg border border-attention/40 bg-bg-panel p-4"
            >
              <header className="flex items-baseline justify-between gap-2">
                <span className="text-card-title text-attention">{z.region}</span>
                <span className="text-meta text-fg-dim">
                  {toNum(z.totalSignals)} signals
                </span>
              </header>
              <p className="mt-2 text-meta text-fg">{z.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {z.countries.slice(0, 6).map((c) => (
                  <span
                    key={c}
                    className="rounded bg-bg-elev px-2 py-0.5 text-meta text-fg-muted"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {z.signalTypes.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 text-meta text-fg-dim"
                  >
                    <span aria-hidden>{SIGNAL_EMOJI[s] ?? '·'}</span>
                    <span>{s}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {countries.length > 0 && (
        <div
          data-testid="world-intel-countries"
          className="rounded-lg border border-border bg-bg-panel p-4"
        >
          <h3 className="mb-2 text-card-title text-fg-muted">
            Top por actividad de señales
          </h3>
          <ul className="space-y-1">
            {countries.map((c, i) => (
              <li
                key={`${c.country}-${i}`}
                data-testid={`intel-country-${c.country}`}
                className="flex items-center justify-between text-meta"
              >
                <span className="text-fg">{c.countryName || c.country}</span>
                <div className="flex items-center gap-2 text-fg-dim">
                  {(c.signalTypes ?? []).slice(0, 3).map((s) => (
                    <span key={s} aria-label={s}>
                      {SIGNAL_EMOJI[s] ?? ''}
                    </span>
                  ))}
                  <span className="text-fg-muted">{toNum(c.totalCount)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Usage: mount inside WorldPage (se hace en este commit).
// Antes estaba oculto dentro de worldmap.html legacy. El dato es profundo
// (decenas de signals militares/satelitales correlados por región) y
// merece visibilidad en el SPA.
