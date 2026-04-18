import { useState } from 'react';
import { t } from '@/i18n/t';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useUpcoming } from './useMovesData';
import { LogisticsAddModal } from './LogisticsAddModal';

function daysNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function MovesUpcoming() {
  const list = useUpcoming();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="moves-add-open"
          onClick={() => setAddOpen(true)}
          className="rounded border border-accent bg-accent/10 px-4 py-2 text-card-title text-accent hover:bg-accent/20"
        >
          + Nuevo movimiento
        </button>
      </div>

      <LogisticsAddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          if (list.status === 'ok') list.refetch();
        }}
      />

      {list.status === 'loading' && <LoadingState />}
      {list.status === 'error' && <ErrorState message={list.error} />}
      {list.status === 'ok' && list.data.length === 0 && (
        <EmptyState title={t('moves.upcoming.empty')} />
      )}
      {list.status === 'ok' && list.data.length > 0 && (
        <div
          data-testid="moves-upcoming-list"
          className="space-y-1 rounded-lg border border-border bg-bg-panel p-2"
        >
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
      )}
    </div>
  );
}
