import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZodSchema } from 'zod';
import { t } from '@/i18n/t';
import { apiFetch, ApiError } from '@/lib/api';
import { SectionShell } from '@/ui/SectionShell';
import { StatBlock } from '@/ui/StatBlock';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { NewsPulseSchema, HealthAlertsSchema } from './types';

type State<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: T };

function useEndpoint<T>(path: string, schema: ZodSchema<T>): State<T> {
  const [state, setState] = useState<State<T>>({ status: 'loading' });
  const ctrlRef = useRef<AbortController | null>(null);
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ status: 'loading' });
    apiFetch(path, schemaRef.current, { signal: ctrl.signal })
      .then((data) => setState({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof ApiError ? err.message : 'unknown';
        setState({ status: 'error', error: msg });
      });
  }, [path]);
  useEffect(() => {
    load();
    return () => ctrlRef.current?.abort();
  }, [load]);
  return state;
}

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : parseInt(v, 10) || 0;
}

// Fase 4 full (overview/map-calm/deep) pendiente. Este MVP surfacea los
// datos más relevantes del worldmonitor sin requerir la heavy-map legacy.
export default function WorldPage() {
  const pulse = useEndpoint('/api/wm/news/pulse', NewsPulseSchema);
  const health = useEndpoint('/api/bio/health-alerts?limit=5', HealthAlertsSchema);

  const volH1 = pulse.status === 'ok' ? toNum(pulse.data.volume.h1) : null;
  const volH24 = pulse.status === 'ok' ? toNum(pulse.data.volume.h24) : null;
  const spikes = pulse.status === 'ok' ? (pulse.data.topic_spikes ?? []) : [];
  const continents = pulse.status === 'ok' ? pulse.data.top_by_continent : [];
  const healthCount = health.status === 'ok' ? health.data.count : null;

  return (
    <SectionShell
      title={t('nav.world')}
      subtitle="Resumen global · el mapa operativo completo sigue en /worldmap.html"
      testId="world-page"
      actions={
        <a
          href="/worldmap.html"
          data-testid="world-cta"
          className="rounded border border-accent px-3 py-2 text-meta text-accent hover:bg-accent/10"
        >
          Abrir WorldMonitor
        </a>
      }
    >
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBlock
          testId="world-kpi-h1"
          kpi={volH1 ?? '—'}
          label="Artículos última hora"
          badge="info"
        />
        <StatBlock
          testId="world-kpi-h24"
          kpi={volH24 ?? '—'}
          label="Últimas 24h"
          badge="info"
        />
        <StatBlock
          testId="world-kpi-spikes"
          kpi={spikes.length}
          label="Topic spikes"
          badge={spikes.length >= 3 ? 'alert' : spikes.length > 0 ? 'warn' : 'none'}
        />
        <StatBlock
          testId="world-kpi-health"
          kpi={healthCount ?? '—'}
          label="Alertas de salud"
          badge={healthCount && healthCount > 0 ? 'warn' : 'none'}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-bg-panel p-4" aria-label="continents">
          <h2 className="mb-3 text-card-title text-fg-muted">Top por continente</h2>
          {pulse.status === 'loading' && <LoadingState />}
          {pulse.status === 'error' && <ErrorState message={pulse.error} />}
          {pulse.status === 'ok' && continents.length === 0 && (
            <EmptyState title="Sin resultados." />
          )}
          {pulse.status === 'ok' && continents.length > 0 && (
            <div data-testid="world-continents-list" className="space-y-1">
              {continents.slice(0, 6).map((c, i) => (
                <ListRow
                  key={`${c.continent}-${i}`}
                  testId={`world-cont-${c.continent}`}
                  title={c.title}
                  subtitle={`${c.continent} · ${c.source_name ?? '?'}`}
                  trailing={c.relevance_score != null ? String(c.relevance_score) : ''}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-bg-panel p-4" aria-label="topic-spikes">
          <h2 className="mb-3 text-card-title text-fg-muted">Topic spikes</h2>
          {pulse.status === 'loading' && <LoadingState />}
          {pulse.status === 'error' && <ErrorState message={pulse.error} />}
          {pulse.status === 'ok' && spikes.length === 0 && (
            <EmptyState title="Sin picos detectados." />
          )}
          {pulse.status === 'ok' && spikes.length > 0 && (
            <div data-testid="world-spikes-list" className="space-y-1">
              {spikes.slice(0, 6).map((s) => (
                <ListRow
                  key={s.topic}
                  testId={`world-spike-${s.topic}`}
                  title={s.topic}
                  subtitle={`velocity ×${Number(s.velocity).toFixed(1)}`}
                  trailing={`${s.article_count} arts`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-6" aria-label="health-alerts">
        <h2 className="mb-3 text-card-title text-fg-muted">Health alerts (WHO/CDC/ECDC)</h2>
        {health.status === 'loading' && <LoadingState />}
        {health.status === 'error' && <ErrorState message={health.error} />}
        {health.status === 'ok' && health.data.count === 0 && (
          <EmptyState title="Sin alertas." />
        )}
        {health.status === 'ok' && health.data.count > 0 && (
          <div
            data-testid="world-health-list"
            className="space-y-1 rounded-lg border border-border bg-bg-panel p-2"
          >
            {health.data.data.map((a) => (
              <ListRow
                key={a.id}
                testId={`world-health-${a.id}`}
                title={a.title}
                subtitle={[a.source, a.country_iso, a.disease].filter(Boolean).join(' · ')}
                trailing={a.alert_level ?? ''}
              />
            ))}
          </div>
        )}
      </section>
    </SectionShell>
  );
}
