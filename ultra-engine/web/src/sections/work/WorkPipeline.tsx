import { useState } from 'react';
import { t } from '@/i18n/t';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { usePipeline, useOpportunities, useJobs } from './useWorkData';
import {
  OPP_STATUSES,
  oppToMatch,
  jobToMatch,
  type OppStatus,
  type JobStatus,
  type MatchLike,
} from './types';

type Props = {
  onOpen: (match: MatchLike) => void;
};

type Source = 'opps' | 'jobs';

const JOB_STATUSES: ReadonlyArray<JobStatus> = ['new', 'saved', 'applied', 'rejected'];

export function WorkPipeline({ onOpen }: Props) {
  const [source, setSource] = useState<Source>('opps');

  return (
    <div className="space-y-4">
      <SourceToggle value={source} onChange={setSource} />
      {source === 'opps' ? (
        <OppsPipeline onOpen={onOpen} />
      ) : (
        <JobsPipeline onOpen={onOpen} />
      )}
    </div>
  );
}

function SourceToggle({ value, onChange }: { value: Source; onChange: (s: Source) => void }) {
  const common =
    'flex-1 rounded border px-3 py-2 text-meta transition md:flex-none md:px-4';
  const active = `${common} border-accent bg-accent/10 text-accent`;
  const idle = `${common} border-border text-fg-muted hover:border-accent`;

  return (
    <div
      data-testid="pipeline-source-toggle"
      className="flex gap-2 rounded-lg border border-border bg-bg-panel p-2"
      role="tablist"
    >
      <button
        type="button"
        role="tab"
        data-testid="pipeline-source-opps"
        aria-selected={value === 'opps'}
        onClick={() => onChange('opps')}
        className={value === 'opps' ? active : idle}
      >
        Opportunities
      </button>
      <button
        type="button"
        role="tab"
        data-testid="pipeline-source-jobs"
        aria-selected={value === 'jobs'}
        onClick={() => onChange('jobs')}
        className={value === 'jobs' ? active : idle}
      >
        Jobs
      </button>
    </div>
  );
}

function OppsPipeline({ onOpen }: { onOpen: (m: MatchLike) => void }) {
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
            contacted→applied <span className="text-fg">{rates.contacted_to_applied}%</span>
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
          <OppColumn key={s} status={s} count={counts[s] ?? 0} onOpen={onOpen} />
        ))}
      </section>
    </div>
  );
}

function OppColumn({
  status,
  count,
  onOpen,
}: {
  status: OppStatus;
  count: number;
  onOpen: (match: MatchLike) => void;
}) {
  const list = useOpportunities({ status, limit: 10 });

  return (
    <div className="rounded-lg border border-border bg-bg-panel p-3">
      <header className="mb-2 flex items-center justify-between">
        <span className="text-card-title text-fg">{t(`status.${status}` as const)}</span>
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

function JobsPipeline({ onOpen }: { onOpen: (m: MatchLike) => void }) {
  return (
    <section
      data-testid="work-pipeline-jobs-kanban"
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
    >
      {JOB_STATUSES.map((s) => (
        <JobColumn key={s} status={s} onOpen={onOpen} />
      ))}
    </section>
  );
}

function JobColumn({
  status,
  onOpen,
}: {
  status: JobStatus;
  onOpen: (match: MatchLike) => void;
}) {
  const list = useJobs({ status, limit: 10 });
  const count = list.status === 'ok' ? list.data.length : 0;

  return (
    <div className="rounded-lg border border-border bg-bg-panel p-3">
      <header className="mb-2 flex items-center justify-between">
        <span className="text-card-title text-fg">{t(`status.${status}` as const)}</span>
        <span
          data-testid={`pipeline-jobs-count-${status}`}
          className="text-meta text-fg-muted"
        >
          {count}
        </span>
      </header>

      {list.status === 'loading' && <LoadingState />}
      {list.status === 'error' && <ErrorState message={list.error} />}
      {list.status === 'ok' && list.data.length === 0 && (
        <EmptyState title={t('work.pipeline.empty')} />
      )}
      {list.status === 'ok' && list.data.length > 0 && (
        <div className="space-y-1">
          {list.data.map((j) => (
            <ListRow
              key={j.id}
              testId={`pipeline-jobs-${status}-${j.id}`}
              title={j.title}
              subtitle={j.company ?? j.source_type ?? ''}
              trailing={j.total_score !== null ? String(j.total_score) : '—'}
              onClick={() => onOpen(jobToMatch(j))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
