import { t } from '@/i18n/t';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { usePipeline, useOpportunities } from './useWorkData';
import { OPP_STATUSES, oppToMatch, type OppStatus, type MatchLike } from './types';

type Props = {
  onOpen: (match: MatchLike) => void;
};

export function WorkPipeline({ onOpen }: Props) {
  const pipeline = usePipeline();

  if (pipeline.status === 'loading') return <LoadingState />;
  if (pipeline.status === 'error') return <ErrorState message={pipeline.error} />;

  const counts: Record<string, number> = {};
  for (const row of pipeline.data.by_status) {
    counts[row.status] = Number(row.count) || 0;
  }

  const total = pipeline.data.total;
  const rates = pipeline.data.conversion_rates;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-bg-panel p-4">
        <div className="flex flex-wrap justify-between gap-6 text-meta text-fg-muted">
          <span>
            Total <span className="text-fg">{total}</span>
          </span>
          <span>
            new→contacted <span className="text-fg">{rates.new_to_contacted}%</span>
          </span>
          <span>
            contacted→applied{' '}
            <span className="text-fg">{rates.contacted_to_applied}%</span>
          </span>
          <span>
            applied→won <span className="text-fg">{rates.applied_to_won}%</span>
          </span>
          <span>
            overall win <span className="text-fg">{rates.overall_win_rate}%</span>
          </span>
        </div>
      </section>

      <section
        data-testid="work-pipeline-kanban"
        className="grid gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {OPP_STATUSES.map((s) => (
          <PipelineColumn
            key={s}
            status={s}
            count={counts[s] ?? 0}
            onOpen={onOpen}
          />
        ))}
      </section>
    </div>
  );
}

function PipelineColumn({
  status,
  count,
  onOpen,
}: {
  status: OppStatus;
  count: number;
  onOpen: (match: MatchLike) => void;
}) {
  // Cada columna hace su propia query al endpoint con filtro status.
  // Limit 10 por columna — kanban no necesita paginación completa en MVP.
  const list = useOpportunities({ status, limit: 10 });

  return (
    <div className="rounded-lg border border-border bg-bg-panel p-3">
      <header className="mb-2 flex items-center justify-between">
        <span className="text-card-title text-fg">
          {t(`status.${status}` as const)}
        </span>
        <span className="text-meta text-fg-muted">{count}</span>
      </header>

      {list.status === 'loading' && <LoadingState />}
      {list.status === 'error' && <ErrorState message={list.error} />}
      {list.status === 'ok' && list.data.length === 0 && (
        <EmptyState title={t('work.pipeline.empty')} />
      )}
      {list.status === 'ok' && list.data.length > 0 && (
        <div className="space-y-1">
          {list.data.map((o) => (
            <ListRow
              key={o.id}
              testId={`pipeline-${status}-${o.id}`}
              title={o.title}
              subtitle={o.source ?? ''}
              trailing={o.match_score !== null ? String(o.match_score) : '—'}
              onClick={() => onOpen(oppToMatch(o))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
