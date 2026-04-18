import type { Opportunity } from '@/sections/work/types';

type Props = {
  opp: Opportunity;
  onOpen?: (opp: Opportunity) => void;
  variant?: 'compact' | 'detailed';
  testId?: string;
};

function formatSalary(o: Opportunity): string | null {
  const cur = o.currency ?? '';
  const toNum = (v: string | number | null): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const min = toNum(o.salary_min);
  const max = toNum(o.salary_max);
  if (!min && !max) return null;
  if (min && max) return `${min.toLocaleString()}–${max.toLocaleString()} ${cur}`;
  return `${(min ?? max)!.toLocaleString()} ${cur}`;
}

function scoreBadgeClass(score: number | null): string {
  if (score === null) return 'text-fg-dim';
  if (score >= 15) return 'text-critical';
  if (score >= 8) return 'text-accent';
  return 'text-fg-muted';
}

// Card reutilizable: muestra title + score + source + salary/payout + tags.
// variant='compact' oculta tags y description. variant='detailed' incluye description truncated.
export function MatchCard({ opp, onOpen, variant = 'compact', testId }: Props) {
  const sal = formatSalary(opp);
  const cls =
    'flex w-full flex-col items-start rounded-lg border border-border bg-bg-panel p-4 ' +
    'text-left transition hover:border-accent hover:bg-bg-elev focus:outline-none focus-visible:border-accent';

  return (
    <button
      type="button"
      data-testid={testId ?? `match-${opp.id}`}
      onClick={() => onOpen?.(opp)}
      className={cls}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="text-card-title line-clamp-2">{opp.title}</span>
        <span
          data-testid={`match-${opp.id}-score`}
          className={`shrink-0 text-kpi-sm ${scoreBadgeClass(opp.match_score)}`}
        >
          {opp.match_score ?? '—'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta text-fg-muted">
        {opp.source && <span>{opp.source}</span>}
        {opp.payout_type && <span>·&nbsp;{opp.payout_type}</span>}
        {sal && <span>·&nbsp;{sal}</span>}
        {opp.status && <span>·&nbsp;{opp.status}</span>}
      </div>
      {variant === 'detailed' && opp.description && (
        <p className="mt-2 text-meta text-fg-muted line-clamp-3">{opp.description}</p>
      )}
      {variant === 'detailed' && opp.tags && opp.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {opp.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded bg-bg-elev px-2 py-0.5 text-meta text-fg-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
