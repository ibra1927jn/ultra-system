import { useMemo, useState } from 'react';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useTimeline, type TimelineEvent } from './useTimeline';

const SOURCE_LABEL: Record<TimelineEvent['source'], string> = {
  doc: 'Documento',
  vaccine: 'Vacuna',
  tax: 'Fiscal',
  membership: 'Membresía',
};

const SEV_CLASS: Record<TimelineEvent['severity'], string> = {
  expired: 'border-l-4 border-l-critical/70',
  critical: 'border-l-4 border-l-critical',
  warn: 'border-l-4 border-l-attention',
  info: 'border-l-4 border-l-fg-dim/30',
};

const FILTER_OPTIONS: ReadonlyArray<{ value: 'all' | TimelineEvent['source']; label: string }> = [
  { value: 'all', label: 'Todo' },
  { value: 'doc', label: 'Documentos' },
  { value: 'tax', label: 'Fiscal' },
  { value: 'vaccine', label: 'Vacunas' },
  { value: 'membership', label: 'Membresías' },
];

function formatDays(n: number): string {
  if (n < 0) return `${n}d · vencido`;
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  return `T-${n}d`;
}

// Unifica document_alerts + tax-deadlines + vaccinations + memberships en
// una única línea de tiempo ordenada por urgencia. Responde a la pregunta
// "¿qué me vence este trimestre?" sin saltar entre 4 tabs.
export function MeTimeline() {
  const tl = useTimeline();
  const [filter, setFilter] = useState<'all' | TimelineEvent['source']>('all');

  const filtered = useMemo(() => {
    if (tl.status !== 'ok') return [];
    return filter === 'all' ? tl.data : tl.data.filter((e) => e.source === filter);
  }, [tl, filter]);

  const bucketOf = (days: number): 'overdue' | 'this-month' | 'quarter' | 'later' => {
    if (days < 0) return 'overdue';
    if (days <= 30) return 'this-month';
    if (days <= 90) return 'quarter';
    return 'later';
  };

  const buckets = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {
      'overdue': [],
      'this-month': [],
      'quarter': [],
      'later': [],
    };
    for (const e of filtered) groups[bucketOf(e.daysRemaining)]!.push(e);
    return groups;
  }, [filtered]);

  if (tl.status === 'loading') return <LoadingState />;
  if (tl.status === 'error') return <ErrorState message={tl.error ?? 'error'} />;
  if (filtered.length === 0) return <EmptyState title="Sin eventos en los próximos 12 meses." />;

  return (
    <div className="space-y-6">
      {tl.partial && (
        <p data-testid="timeline-partial" className="text-meta text-attention">
          Datos parciales — una fuente no respondió. Mostrando el resto.
        </p>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-bg-panel p-2">
        {FILTER_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            data-testid={`timeline-filter-${o.value}`}
            onClick={() => setFilter(o.value)}
            className={
              filter === o.value
                ? 'rounded border border-accent bg-accent/10 px-3 py-1 text-meta text-accent'
                : 'rounded border border-transparent px-3 py-1 text-meta text-fg-muted hover:bg-bg-elev hover:text-fg'
            }
          >
            {o.label}
          </button>
        ))}
      </div>

      {(
        [
          ['overdue', 'Vencidos'],
          ['this-month', 'Próximos 30 días'],
          ['quarter', 'Próximos 90 días'],
          ['later', 'Más tarde (>90d)'],
        ] as const
      ).map(([key, header]) => {
        const rows = buckets[key] ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={key} aria-label={header}>
            <h2 className="mb-2 text-card-title text-fg-muted">
              {header} · <span className="text-fg-dim">{rows.length}</span>
            </h2>
            <div
              data-testid={`timeline-bucket-${key}`}
              className="space-y-1 rounded-lg border border-border bg-bg-panel p-2"
            >
              {rows.map((e) => (
                <div
                  key={e.id}
                  data-testid={`timeline-event-${e.id}`}
                  className={`rounded-md ${SEV_CLASS[e.severity]}`}
                >
                  <ListRow
                    testId={`timeline-row-${e.id}`}
                    title={e.title}
                    subtitle={[SOURCE_LABEL[e.source], e.subtitle].filter(Boolean).join(' · ')}
                    trailing={formatDays(e.daysRemaining)}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
