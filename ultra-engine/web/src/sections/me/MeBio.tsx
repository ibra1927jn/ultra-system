import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { t } from '@/i18n/t';
import { ListRow } from '@/ui/ListRow';
import { StatBlock } from '@/ui/StatBlock';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useRecentMood, useSchengen } from './useMeData';
import { MoodLogModal } from './MoodLogModal';
import { Sparkline } from '@/ui/Sparkline';

function numOrNull(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function MoodTrend({
  entries,
}: {
  entries: ReadonlyArray<{ mood: number | string | null; energy: number | string | null; notes: string | null; logged_at: string | null; id: number }>;
}) {
  const rev = [...entries].reverse();
  const moodSeries: number[] = [];
  const energySeries: number[] = [];
  for (const e of rev) {
    const m = numOrNull(e.mood);
    const en = numOrNull(e.energy);
    if (m !== null) moodSeries.push(m);
    if (en !== null) energySeries.push(en);
  }
  const avg = (s: number[]): number | null =>
    s.length === 0 ? null : Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10;
  const moodAvg = avg(moodSeries);
  const energyAvg = avg(energySeries);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg-panel p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-meta text-fg-muted">Mood</div>
          <div className="text-kpi-sm text-accent">
            {moodAvg ?? '—'}
            <span className="ml-1 text-meta text-fg-dim">/10 avg</span>
          </div>
        </div>
        <Sparkline
          values={moodSeries}
          min={1}
          max={10}
          width={280}
          height={36}
          color="var(--accent, #22d3ae)"
          testId="me-mood-trend-sparkline"
          ariaLabel={`Mood últimas ${moodSeries.length} entradas`}
        />
      </div>
      {energySeries.length >= 2 && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-meta text-fg-muted">Energía</div>
            <div className="text-kpi-sm text-fg">
              {energyAvg ?? '—'}
              <span className="ml-1 text-meta text-fg-dim">/10 avg</span>
            </div>
          </div>
          <Sparkline
            values={energySeries}
            min={1}
            max={10}
            width={280}
            height={36}
            color="var(--attention, #f59e0b)"
            testId="me-energy-trend-sparkline"
            ariaLabel={`Energía últimas ${energySeries.length} entradas`}
          />
        </div>
      )}
      <p className="text-meta text-fg-dim">
        {moodSeries.length} entradas · más reciente a la derecha
      </p>
    </div>
  );
}

export function MeBio() {
  const mood = useRecentMood(30);
  const schengen = useSchengen();
  const [logOpen, setLogOpen] = useState(false);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (params.get('action') === 'log') {
      setLogOpen(true);
      const next = new URLSearchParams(params);
      next.delete('action');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const schengenKpi = schengen.status === 'ok' ? schengen.data.days_used : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="mood-log-open"
          onClick={() => setLogOpen(true)}
          className="rounded border border-accent bg-accent/10 px-4 py-2 text-card-title text-accent hover:bg-accent/20"
        >
          Log mood ahora · 5s
        </button>
      </div>

      <MoodLogModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onLogged={() => {
          if (mood.status === 'ok') mood.refetch();
        }}
      />

      <section aria-label="schengen" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StatBlock
          testId="me-bio-schengen-used"
          kpi={schengenKpi ?? '—'}
          label={t('me.schengen.label')}
          badge={
            schengenKpi === null
              ? 'none'
              : schengenKpi >= 75
                ? 'alert'
                : schengenKpi >= 60
                  ? 'warn'
                  : 'info'
          }
        />
        <StatBlock
          testId="me-bio-mood-count"
          kpi={mood.status === 'ok' ? mood.data.count : '—'}
          label={t('me.kpi.mood')}
          badge="info"
        />
      </section>

      {mood.status === 'ok' && mood.data.count >= 2 && (
        <section aria-label="mood-trend" data-testid="me-mood-trend">
          <h2 className="mb-3 text-card-title text-fg-muted">Tendencia · últimos 30d</h2>
          <MoodTrend entries={mood.data.data} />
        </section>
      )}

      <section aria-label="mood">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('me.mood.title')}</h2>
        {mood.status === 'loading' && <LoadingState />}
        {mood.status === 'error' && <ErrorState message={mood.error} />}
        {mood.status === 'ok' && mood.data.count === 0 && (
          <EmptyState title={t('me.mood.empty')} />
        )}
        {mood.status === 'ok' && mood.data.count > 0 && (
          <div data-testid="me-mood-list" className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {mood.data.data.slice(0, 10).map((m) => {
              const moodN = numOrNull(m.mood);
              const energyN = numOrNull(m.energy);
              const loggedDate = m.logged_at ? new Date(m.logged_at).toISOString().slice(0, 10) : '';
              return (
                <ListRow
                  key={m.id}
                  testId={`me-mood-${m.id}`}
                  title={`Mood ${moodN ?? '?'}/10 · energía ${energyN ?? '?'}/10`}
                  subtitle={m.notes ?? ''}
                  trailing={loggedDate}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
