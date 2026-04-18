import { useMemo, useState } from 'react';
import { t } from '@/i18n/t';
import { MatchCard } from '@/ui/MatchCard';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useOpportunities, useJobs } from './useWorkData';
import {
  OPP_STATUSES,
  oppToMatch,
  jobToMatch,
  type OppStatus,
  type MatchLike,
} from './types';

type Props = {
  onOpen: (match: MatchLike) => void;
};

type SourceMode = 'opps' | 'jobs';
type RemoteMode = 'any' | 'true' | 'false';

const SOURCE_OPTIONS: ReadonlyArray<{ value: SourceMode; label: string }> = [
  { value: 'opps', label: 'Opportunities' },
  { value: 'jobs', label: 'Jobs' },
];

const REMOTE_OPTIONS: ReadonlyArray<{ value: RemoteMode; label: string }> = [
  { value: 'any', label: 'Cualquiera' },
  { value: 'true', label: 'Remoto' },
  { value: 'false', label: 'Presencial' },
];

export function WorkMatches({ onOpen }: Props) {
  const [source, setSource] = useState<SourceMode>('opps');
  const [minScore, setMinScore] = useState(8);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OppStatus | ''>('');
  const [country, setCountry] = useState('');
  const [visaOnly, setVisaOnly] = useState(false);
  const [remote, setRemote] = useState<RemoteMode>('any');

  const oppFilters = useMemo(
    () => ({
      minScore,
      q: q.trim().length >= 2 ? q : undefined,
      status: status || undefined,
      limit: 50,
    }),
    [minScore, q, status],
  );

  const jobFilters = useMemo(
    () => ({
      minScore,
      q: q.trim().length >= 2 ? q : undefined,
      country: country.trim().length === 2 ? country : undefined,
      visa: visaOnly || undefined,
      remote,
      limit: 50,
    }),
    [minScore, q, country, visaOnly, remote],
  );

  const oppList = useOpportunities(source === 'opps' ? oppFilters : { limit: 0 });
  const jobList = useJobs(source === 'jobs' ? jobFilters : { limit: 0 });

  const list = source === 'opps' ? oppList : jobList;
  const matches: MatchLike[] = (() => {
    if (list.status !== 'ok') return [];
    return source === 'opps'
      ? oppList.status === 'ok'
        ? oppList.data.map(oppToMatch)
        : []
      : jobList.status === 'ok'
        ? jobList.data.map(jobToMatch)
        : [];
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-bg-panel p-4">
        <label className="flex w-[200px] flex-col text-meta text-fg-muted">
          <span className="mb-1">Fuente</span>
          <div className="flex gap-1">
            {SOURCE_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                data-testid={`work-source-${s.value}`}
                onClick={() => setSource(s.value)}
                className={
                  source === s.value
                    ? 'flex-1 rounded border border-accent bg-accent/10 px-3 py-2 text-card-title text-accent'
                    : 'flex-1 rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg-muted hover:border-accent'
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </label>

        <label className="flex min-w-[200px] flex-1 flex-col text-meta text-fg-muted">
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

        <label className="flex w-[120px] flex-col text-meta text-fg-muted">
          <span className="mb-1">{t('work.filters.minScore')}</span>
          <input
            data-testid="work-filter-score"
            type="number"
            min={0}
            max={100}
            step={1}
            value={minScore}
            onChange={(e) => setMinScore(parseInt(e.target.value, 10) || 0)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          />
        </label>

        {source === 'opps' && (
          <label className="flex w-[140px] flex-col text-meta text-fg-muted">
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
        )}

        {source === 'jobs' && (
          <>
            <label className="flex w-[110px] flex-col text-meta text-fg-muted">
              <span className="mb-1">País (ISO2)</span>
              <input
                data-testid="work-filter-country"
                type="text"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                placeholder="NZ"
                className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg uppercase focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex w-[140px] flex-col text-meta text-fg-muted">
              <span className="mb-1">Remoto</span>
              <select
                data-testid="work-filter-remote"
                value={remote}
                onChange={(e) => setRemote(e.target.value as RemoteMode)}
                className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
              >
                {REMOTE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-meta text-fg-muted">
              <input
                data-testid="work-filter-visa"
                type="checkbox"
                checked={visaOnly}
                onChange={(e) => setVisaOnly(e.target.checked)}
                className="accent-accent"
              />
              <span>Solo con visa sponsor</span>
            </label>
          </>
        )}
      </div>

      {list.status === 'loading' && <LoadingState />}
      {list.status === 'error' && <ErrorState message={list.error} />}
      {list.status === 'ok' && matches.length === 0 && (
        <EmptyState title={t('work.empty')} />
      )}
      {list.status === 'ok' && matches.length > 0 && (
        <div
          data-testid="work-matches-list"
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
        >
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} onOpen={onOpen} variant="detailed" />
          ))}
        </div>
      )}
    </div>
  );
}
