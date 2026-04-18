import { t } from '@/i18n/t';
import { StatBlock } from '@/ui/StatBlock';
import { MatchCard } from '@/ui/MatchCard';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { useHighScoreOpps, usePipeline } from './useWorkData';
import type { Opportunity } from './types';

type Props = {
  onOpen: (opp: Opportunity) => void;
};

export function WorkOverview({ onOpen }: Props) {
  const pipeline = usePipeline();
  const highScore = useHighScoreOpps(8, 5);

  const kpiHighScore = highScore.status === 'ok' ? highScore.data.length : null;
  const kpiNew =
    pipeline.status === 'ok'
      ? (pipeline.data.by_status.find((s) => s.status === 'new')?.count ?? 0)
      : null;
  const kpiFollowUp = pipeline.status === 'ok' ? pipeline.data.need_follow_up.length : null;
  const kpiDeadlines =
    pipeline.status === 'ok' ? pipeline.data.upcoming_deadlines.length : null;
  const kpiWinRate =
    pipeline.status === 'ok' ? pipeline.data.conversion_rates.overall_win_rate : null;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatBlock
          testId="work-kpi-high"
          kpi={toStr(kpiHighScore)}
          label={t('work.kpi.highScore')}
          badge={kpiHighScore && kpiHighScore > 0 ? 'info' : 'none'}
        />
        <StatBlock
          testId="work-kpi-new"
          kpi={toStr(kpiNew)}
          label={t('work.kpi.new')}
          badge="info"
        />
        <StatBlock
          testId="work-kpi-followup"
          kpi={toStr(kpiFollowUp)}
          label={t('work.kpi.followUp')}
          badge={kpiFollowUp && kpiFollowUp > 0 ? 'warn' : 'none'}
        />
        <StatBlock
          testId="work-kpi-deadlines"
          kpi={toStr(kpiDeadlines)}
          label={t('work.kpi.deadlines')}
          badge={kpiDeadlines && kpiDeadlines > 0 ? 'alert' : 'none'}
        />
        <StatBlock
          testId="work-kpi-winrate"
          kpi={kpiWinRate !== null ? `${kpiWinRate}%` : '—'}
          label={t('work.kpi.winRate')}
          badge="info"
        />
      </section>

      <section aria-label="featured">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('work.featured.title')}</h2>
        {highScore.status === 'loading' && <LoadingState />}
        {highScore.status === 'error' && <ErrorState message={highScore.error} />}
        {highScore.status === 'ok' && highScore.data.length === 0 && (
          <EmptyState title={t('work.empty')} />
        )}
        {highScore.status === 'ok' && highScore.data.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {highScore.data.map((o) => (
              <MatchCard key={o.id} opp={o} onOpen={onOpen} />
            ))}
          </div>
        )}
      </section>

      {pipeline.status === 'ok' && pipeline.data.need_follow_up.length > 0 && (
        <section aria-label="follow-up">
          <h2 className="mb-3 text-card-title text-fg-muted">
            {t('work.kpi.followUp')}
          </h2>
          <div className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {pipeline.data.need_follow_up.slice(0, 5).map((row) => (
              <ListRow
                key={row.id}
                title={row.title}
                subtitle={row.source ?? ''}
                trailing={`${row.days_since_created ?? '?'}d`}
              />
            ))}
          </div>
        </section>
      )}

      {pipeline.status === 'ok' && pipeline.data.upcoming_deadlines.length > 0 && (
        <section aria-label="deadlines">
          <h2 className="mb-3 text-card-title text-fg-muted">
            {t('work.kpi.deadlines')}
          </h2>
          <div className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {pipeline.data.upcoming_deadlines.slice(0, 5).map((row) => (
              <ListRow
                key={row.id}
                title={row.title}
                subtitle={row.deadline ?? ''}
                trailing={`T-${row.days_until ?? '?'}d`}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function toStr(v: number | string | null): string | number | null {
  if (v === null || v === undefined) return '—';
  return v;
}
