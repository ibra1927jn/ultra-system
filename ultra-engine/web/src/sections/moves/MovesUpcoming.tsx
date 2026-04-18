import { t } from '@/i18n/t';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useUpcoming } from './useMovesData';

function daysNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function MovesUpcoming() {
  const list = useUpcoming();

  if (list.status === 'loading') return <LoadingState />;
  if (list.status === 'error') return <ErrorState message={list.error} />;
  if (list.data.length === 0) return <EmptyState title={t('moves.upcoming.empty')} />;

  return (
    <div data-testid="moves-upcoming-list" className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
      {list.data.map((i) => (
        <ListRow
          key={i.id}
          testId={`moves-up-${i.id}`}
          title={i.title ?? i.type ?? 'evento'}
          subtitle={[i.location, i.date].filter(Boolean).join(' · ')}
          trailing={daysNum(i.days_until) !== null ? `T-${daysNum(i.days_until)}d` : ''}
        />
      ))}
    </div>
  );
}
