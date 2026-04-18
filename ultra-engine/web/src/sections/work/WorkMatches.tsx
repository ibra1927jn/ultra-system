import { useMemo, useState } from 'react';
import { t } from '@/i18n/t';
import { MatchCard } from '@/ui/MatchCard';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useOpportunities } from './useWorkData';
import { OPP_STATUSES, type OppStatus, type Opportunity } from './types';

type Props = {
  onOpen: (opp: Opportunity) => void;
};

export function WorkMatches({ onOpen }: Props) {
  const [minScore, setMinScore] = useState(8);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OppStatus | ''>('');

  const filters = useMemo(
    () => ({
      minScore,
      q: q.trim().length >= 2 ? q : undefined,
      status: status || undefined,
      limit: 50,
    }),
    [minScore, q, status],
  );

  const list = useOpportunities(filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-bg-panel p-4">
        <label className="flex min-w-[220px] flex-1 flex-col text-meta text-fg-muted">
          <span className="mb-1">{t('work.filters.search')}</span>
          <input
            data-testid="work-filter-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="eg. solidity audit"
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg placeholder:text-fg-dim focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex w-[150px] flex-col text-meta text-fg-muted">
          <span className="mb-1">{t('work.filters.minScore')}</span>
          <input
            data-testid="work-filter-score"
            type="number"
            min={0}
            max={50}
            step={1}
            value={minScore}
            onChange={(e) => setMinScore(parseInt(e.target.value, 10) || 0)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex w-[160px] flex-col text-meta text-fg-muted">
          <span className="mb-1">{t('work.filters.status')}</span>
          <select
            data-testid="work-filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as OppStatus | '')}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          >
            <option value="">{t('work.filters.all')}</option>
            {OPP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as const)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.status === 'loading' && <LoadingState />}
      {list.status === 'error' && <ErrorState message={list.error} />}
      {list.status === 'ok' && list.data.length === 0 && (
        <EmptyState title={t('work.empty')} />
      )}
      {list.status === 'ok' && list.data.length > 0 && (
        <div
          data-testid="work-matches-list"
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
        >
          {list.data.map((o) => (
            <MatchCard key={o.id} opp={o} onOpen={onOpen} variant="detailed" />
          ))}
        </div>
      )}
    </div>
  );
}
