import { useState } from 'react';
import { t } from '@/i18n/t';
import { ListRow } from '@/ui/ListRow';
import { StatBlock } from '@/ui/StatBlock';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useRecentMood, useSchengen } from './useMeData';
import { MoodLogModal } from './MoodLogModal';

function numOrNull(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function MeBio() {
  const mood = useRecentMood(30);
  const schengen = useSchengen();
  const [logOpen, setLogOpen] = useState(false);

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
