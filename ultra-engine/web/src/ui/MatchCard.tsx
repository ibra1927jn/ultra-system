import { memo } from 'react';
import type { MatchLike } from '@/sections/work/types';

type Props = {
  match: MatchLike;
  onOpen?: (match: MatchLike) => void;
  variant?: 'compact' | 'detailed';
  testId?: string;
};

function formatSalary(m: MatchLike): string | null {
  const cur = m.currency ?? '';
  const toNum = (v: string | number | null): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const min = toNum(m.salary_min);
  const max = toNum(m.salary_max);
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

// Card reutilizable — acepta MatchLike (opp o job adaptados). Título + score +
// subtitle + salary + tags + visa badge. variant='compact' oculta desc/tags.
// memo() evita re-renders cuando otros MatchCard de la misma lista cambian —
// WorkMatches renderiza hasta 50 cards y filtros triggerean re-render padre.
function MatchCardImpl({ match, onOpen, variant = 'compact', testId }: Props) {
  const sal = formatSalary(match);
  const cls =
    'flex w-full flex-col items-start rounded-lg border border-border bg-bg-panel p-4 ' +
    'text-left transition hover:border-accent hover:bg-bg-elev focus:outline-none focus-visible:border-accent';

  return (
    <button
      type="button"
      data-testid={testId ?? `match-${match.id}`}
      onClick={() => onOpen?.(match)}
      className={cls}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="text-card-title line-clamp-2">{match.title}</span>
        <span
          data-testid={`match-${match.id}-score`}
          className={`shrink-0 text-kpi-sm ${scoreBadgeClass(match.score)}`}
        >
          {match.score ?? '—'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta text-fg-muted">
        {match.subtitle && <span>{match.subtitle}</span>}
        {match.source && <span>·&nbsp;{match.source}</span>}
        {match.location && <span>·&nbsp;{match.location}</span>}
        {sal && <span>·&nbsp;{sal}</span>}
        {match.status && <span>·&nbsp;{match.status}</span>}
        {match.visaOk === true && (
          <span
            data-testid={`match-${match.id}-visa`}
            className="rounded bg-accent/15 px-2 py-0.5 text-accent"
          >
            visa ok
          </span>
        )}
      </div>
      {variant === 'detailed' && match.description && (
        <p className="mt-2 text-meta text-fg-muted line-clamp-3">{match.description}</p>
      )}
      {variant === 'detailed' && match.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {match.tags.slice(0, 6).map((tag) => (
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

export const MatchCard = memo(MatchCardImpl);

