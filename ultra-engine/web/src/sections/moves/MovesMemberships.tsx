import { t } from '@/i18n/t';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useMemberships } from './useMovesData';

function daysNum(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function MovesMemberships() {
  const list = useMemberships();

  if (list.status === 'loading') return <LoadingState />;
  if (list.status === 'error') return <ErrorState message={list.error} />;
  if (list.data.length === 0) return <EmptyState title={t('moves.memberships.empty')} />;

  return (
    <div data-testid="moves-memberships-list" className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
      {list.data.map((m) => {
        const days = daysNum(m.days_to_renewal);
        const trailing = days !== null
          ? days < 0
            ? `${days}d (vencido)`
            : `T-${days}d`
          : '—';
        const subtitle = [
          m.annual_cost ? `${m.annual_cost} ${m.currency ?? ''}/yr` : null,
          m.auto_renew ? 'auto-renew' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <ListRow
            key={m.id}
            testId={`moves-mem-${m.id}`}
            title={m.platform}
            subtitle={subtitle}
            trailing={trailing}
          />
        );
      })}
    </div>
  );
}
