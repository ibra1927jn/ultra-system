import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { t } from '@/i18n/t';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useToast } from '@/ui/Toast';
import { useUpcoming } from './useMovesData';
import { LogisticsAddModal } from './LogisticsAddModal';
import type { LogisticsItem } from './types';

function daysNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function setStatus(id: number, status: 'done' | 'confirmed' | 'pending') {
  const res = await fetch(`/api/logistics/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return res.ok;
}

export function MovesUpcoming() {
  const list = useUpcoming();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  useEffect(() => {
    if (params.get('action') === 'add') {
      setAddOpen(true);
      const next = new URLSearchParams(params);
      next.delete('action');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const handleDone = async (item: LogisticsItem) => {
    setBusy(item.id);
    const ok = await setStatus(item.id, 'done');
    setBusy(null);
    if (ok) {
      toast.success(`"${item.title ?? 'item'}" marcado hecho`);
      if (list.status === 'ok') list.refetch();
    } else {
      toast.error('Error al actualizar');
    }
  };

  const handleConfirm = async (item: LogisticsItem) => {
    setBusy(item.id);
    const ok = await setStatus(item.id, 'confirmed');
    setBusy(null);
    if (ok) {
      toast.success(`"${item.title ?? 'item'}" confirmado`);
      if (list.status === 'ok') list.refetch();
    } else {
      toast.error('Error al actualizar');
    }
  };

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
          {list.data.map((i) => {
            const days = daysNum(i.days_until);
            return (
              <div
                key={i.id}
                data-testid={`moves-up-${i.id}`}
                className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-bg-elev"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-card-title">
                    {i.title ?? i.type ?? 'evento'}
                  </span>
                  <span className="block truncate text-meta text-fg-muted">
                    {[i.type, i.location, i.date].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-meta text-fg-muted">
                  {days !== null ? `T-${days}d` : ''}
                </span>
                <div className="flex shrink-0 gap-1">
                  {i.status !== 'confirmed' && (
                    <button
                      type="button"
                      disabled={busy === i.id}
                      data-testid={`moves-up-${i.id}-confirm`}
                      onClick={() => handleConfirm(i)}
                      className="rounded border border-border px-2 py-0.5 text-meta text-fg-muted hover:border-accent hover:text-fg disabled:opacity-50"
                    >
                      confirmar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy === i.id}
                    data-testid={`moves-up-${i.id}-done`}
                    onClick={() => handleDone(i)}
                    className="rounded border border-accent px-2 py-0.5 text-meta text-accent hover:bg-accent/10 disabled:opacity-50"
                  >
                    ✓ hecho
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
