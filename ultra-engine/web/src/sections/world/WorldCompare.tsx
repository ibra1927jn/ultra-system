import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useEndpoint } from '@/lib/useEndpoint';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { Sparkline } from '@/ui/Sparkline';

const CountrySchema = z.object({
  iso: z.string(),
  name: z.string(),
  activity: z.object({
    article_count: z.number(),
    high_score: z.number(),
    negative: z.number(),
    positive: z.number(),
    avg_score: z.union([z.number(), z.string()]),
  }).passthrough(),
  sentiment: z.object({
    positive_pct: z.union([z.number(), z.string()]),
    neutral_pct: z.union([z.number(), z.string()]),
    negative_pct: z.union([z.number(), z.string()]),
  }).passthrough(),
  risk: z.unknown().nullable(),
  alert: z.unknown().nullable(),
  timeline: z.array(z.object({
    day: z.string(),
    articles: z.union([z.number(), z.string()]),
  })).nullable().optional(),
  top_article: z.object({
    title: z.string(),
    url: z.string().nullable(),
  }).passthrough().nullable().optional(),
}).passthrough();

const CompareSchema = z.object({
  ok: z.literal(true),
  hours: z.number(),
  count: z.number(),
  data: z.array(CountrySchema),
}).passthrough();

type Country = z.infer<typeof CountrySchema>;

// Presets: países del usuario + vecinos estratégicos.
const PRESET_ISOS = ['NZ', 'AU', 'ES', 'DZ', 'FR', 'DE', 'MA', 'US', 'GB'];

function toNum(v: number | string): number {
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

export function WorldCompare() {
  const [selected, setSelected] = useState<string[]>(['NZ', 'ES', 'DZ']);

  const toggle = (iso: string) => {
    setSelected((curr) =>
      curr.includes(iso)
        ? curr.filter((c) => c !== iso)
        : curr.length >= 4
          ? curr
          : [...curr, iso],
    );
  };

  const path = useMemo(() => {
    if (selected.length === 0) return null;
    return `/api/wm/compare?isos=${selected.join(',')}&hours=48`;
  }, [selected]);

  const cmp = useEndpoint(path, CompareSchema);

  return (
    <section className="mt-6 space-y-3" aria-label="world-compare">
      <h2 className="text-card-title text-fg-muted">
        Comparar países <span className="text-fg-dim">(máx 4)</span>
      </h2>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-bg-panel p-3">
        {PRESET_ISOS.map((iso) => (
          <button
            key={iso}
            type="button"
            data-testid={`compare-toggle-${iso}`}
            onClick={() => toggle(iso)}
            disabled={!selected.includes(iso) && selected.length >= 4}
            className={
              selected.includes(iso)
                ? 'rounded border border-accent bg-accent/10 px-3 py-1 text-card-title text-accent'
                : 'rounded border border-border bg-bg-base px-3 py-1 text-card-title text-fg-muted hover:border-accent disabled:opacity-40'
            }
          >
            {iso}
          </button>
        ))}
        <span className="ml-auto text-meta text-fg-dim">{selected.length} · 48h window</span>
      </div>

      {selected.length === 0 && (
        <EmptyState title="Elige 1-4 países para comparar." />
      )}

      {selected.length > 0 && cmp.status === 'loading' && <LoadingState />}
      {selected.length > 0 && cmp.status === 'error' && <ErrorState message={cmp.error} />}
      {selected.length > 0 && cmp.status === 'ok' && cmp.data.data.length > 0 && (
        <div
          data-testid="compare-grid"
          className={`grid gap-3 md:grid-cols-${Math.min(cmp.data.data.length, 2)} xl:grid-cols-${cmp.data.data.length}`}
          style={{
            gridTemplateColumns: `repeat(${Math.min(cmp.data.data.length, 4)}, minmax(0, 1fr))`,
          }}
        >
          {cmp.data.data.map((c) => (
            <CountryCard key={c.iso} country={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function CountryCard({ country }: { country: Country }) {
  const tl = country.timeline ?? [];
  const series = tl.map((p) => toNum(p.articles));
  const negPct = toNum(country.sentiment.negative_pct);

  return (
    <div
      data-testid={`compare-card-${country.iso}`}
      className="rounded-lg border border-border bg-bg-panel p-4"
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-card-title text-fg">{country.iso}</span>
        <span className="text-meta text-fg-dim">{country.name}</span>
      </header>

      <div className="grid grid-cols-2 gap-2 text-meta">
        <Stat label="Artículos" value={country.activity.article_count} />
        <Stat label="High score" value={country.activity.high_score} highlight="accent" />
        <Stat label="Negativo %" value={`${Math.round(negPct)}%`} highlight={negPct > 50 ? 'critical' : 'muted'} />
        <Stat label="Avg score" value={toNum(country.activity.avg_score).toFixed(1)} />
      </div>

      {series.length >= 2 && (
        <div className="mt-3">
          <Sparkline
            values={series}
            width={200}
            height={28}
            color="var(--accent, #22d3ae)"
            testId={`compare-${country.iso}-spark`}
            ariaLabel={`Timeline ${country.iso}`}
          />
          <p className="mt-1 text-meta text-fg-dim">{series.length} días</p>
        </div>
      )}

      {country.top_article && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-meta text-fg-dim">Top:</p>
          {country.top_article.url ? (
            <a
              href={country.top_article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block line-clamp-2 text-meta text-fg hover:text-accent"
            >
              {country.top_article.title}
            </a>
          ) : (
            <p className="mt-1 line-clamp-2 text-meta text-fg">{country.top_article.title}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: 'accent' | 'critical' | 'muted';
}) {
  const cls =
    highlight === 'accent'
      ? 'text-accent'
      : highlight === 'critical'
        ? 'text-critical'
        : highlight === 'muted'
          ? 'text-fg-muted'
          : 'text-fg';
  return (
    <div>
      <div className="text-fg-dim">{label}</div>
      <div className={`text-kpi-sm ${cls}`}>{value}</div>
    </div>
  );
}
