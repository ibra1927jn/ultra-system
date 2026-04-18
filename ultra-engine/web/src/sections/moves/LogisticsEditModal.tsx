import { useEffect, useState } from 'react';
import { DetailDrawer } from '@/ui/DetailDrawer';
import { useToast } from '@/ui/Toast';
import type { LogisticsItem } from './types';

type Props = {
  item: LogisticsItem | null;
  onClose: () => void;
  onSaved: () => void;
};

type Status = 'pending' | 'confirmed' | 'done';
type Type = 'transport' | 'accommodation' | 'visa' | 'appointment';

const STATUSES: ReadonlyArray<{ value: Status; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'done', label: 'Hecho' },
];

const TYPES: ReadonlyArray<{ value: Type; label: string }> = [
  { value: 'transport', label: '🚗 Transporte' },
  { value: 'accommodation', label: '🏠 Alojamiento' },
  { value: 'visa', label: '🛂 Visa' },
  { value: 'appointment', label: '📅 Cita' },
];

async function updateLogistics(id: number, body: Record<string, unknown>) {
  try {
    const res = await fetch(`/api/logistics/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      return { ok: false as const, error: b?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'unknown' };
  }
}

function isValidType(s: string | null): s is Type {
  return s === 'transport' || s === 'accommodation' || s === 'visa' || s === 'appointment';
}

function isValidStatus(s: string | null): s is Status {
  return s === 'pending' || s === 'confirmed' || s === 'done';
}

export function LogisticsEditModal({ item, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Type>('transport');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Status>('pending');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!item) return;
    setTitle(item.title ?? '');
    setType(isValidType(item.type) ? item.type : 'transport');
    setDate(item.date ? item.date.slice(0, 10) : '');
    setLocation(item.location ?? '');
    setNotes(item.notes ?? '');
    setStatus(isValidStatus(item.status ?? null) ? (item.status as Status) : 'pending');
    setCost(item.cost !== null && item.cost !== undefined ? String(item.cost) : '');
    setErr(null);
  }, [item]);

  const handleSubmit = async () => {
    if (!item) return;
    if (!title.trim()) {
      setErr('Título requerido');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await updateLogistics(item.id, {
      type,
      title: title.trim(),
      date,
      location: location.trim() || null,
      notes: notes.trim() || null,
      status,
      cost: cost ? parseFloat(cost) : null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`"${title}" actualizado`);
      onSaved();
      onClose();
    } else {
      setErr(res.error);
      toast.error(`Error: ${res.error}`);
    }
  };

  return (
    <DetailDrawer
      open={item !== null}
      onClose={onClose}
      title={`Editar · ${item?.title ?? ''}`}
      testId="logistics-edit-drawer"
      actions={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1 text-meta text-fg hover:border-accent"
          >
            cancelar
          </button>
          <span className="flex-1" />
          <button
            type="button"
            data-testid="logistics-edit-submit"
            disabled={busy}
            onClick={handleSubmit}
            className="rounded border border-accent bg-accent/10 px-3 py-1 text-meta text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {busy ? 'guardando…' : 'guardar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Tipo</span>
          <div className="flex flex-wrap gap-1">
            {TYPES.map((o) => (
              <button
                key={o.value}
                type="button"
                data-testid={`edit-type-${o.value}`}
                onClick={() => setType(o.value)}
                className={
                  type === o.value
                    ? 'rounded border border-accent bg-accent/10 px-3 py-2 text-card-title text-accent'
                    : 'rounded border border-border px-3 py-2 text-card-title text-fg-muted hover:border-accent'
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </label>

        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Título *</span>
          <input
            data-testid="edit-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col text-meta text-fg-muted">
            <span className="mb-1">Fecha</span>
            <input
              data-testid="edit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex w-[140px] flex-col text-meta text-fg-muted">
            <span className="mb-1">Coste (NZD)</span>
            <input
              data-testid="edit-cost"
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Ubicación</span>
          <input
            data-testid="edit-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          />
        </label>

        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Estado</span>
          <div className="flex gap-1">
            {STATUSES.map((o) => (
              <button
                key={o.value}
                type="button"
                data-testid={`edit-status-${o.value}`}
                onClick={() => setStatus(o.value)}
                className={
                  status === o.value
                    ? 'flex-1 rounded border border-accent bg-accent/10 px-3 py-2 text-card-title text-accent'
                    : 'flex-1 rounded border border-border px-3 py-2 text-card-title text-fg-muted hover:border-accent'
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </label>

        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Notas</span>
          <textarea
            data-testid="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={3}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          />
        </label>

        {err && (
          <p role="alert" className="text-meta text-critical">
            {err}
          </p>
        )}
      </div>
    </DetailDrawer>
  );
}
