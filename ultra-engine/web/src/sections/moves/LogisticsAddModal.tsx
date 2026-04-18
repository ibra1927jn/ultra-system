import { useState } from 'react';
import { DetailDrawer } from '@/ui/DetailDrawer';
import { useToast } from '@/ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type Type = 'transport' | 'accommodation' | 'visa' | 'appointment';
type Status = 'pending' | 'confirmed' | 'done';

const TYPES: ReadonlyArray<{ value: Type; label: string }> = [
  { value: 'transport', label: '🚗 Transporte' },
  { value: 'accommodation', label: '🏠 Alojamiento' },
  { value: 'visa', label: '🛂 Visa' },
  { value: 'appointment', label: '📅 Cita' },
];

const STATUSES: ReadonlyArray<{ value: Status; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'done', label: 'Hecho' },
];

async function createLogistics(payload: {
  type: Type;
  title: string;
  date: string;
  location: string | null;
  notes: string | null;
  status: Status;
  cost: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/logistics', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: payload.type,
        title: payload.title,
        date: payload.date,
        location: payload.location,
        notes: payload.notes,
        status: payload.status,
        cost: payload.cost ?? 0,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

export function LogisticsAddModal({ open, onClose, onCreated }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<Type>('transport');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Status>('pending');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const reset = () => {
    setType('transport');
    setTitle('');
    setDate(today);
    setLocation('');
    setNotes('');
    setStatus('pending');
    setCost('');
    setErr(null);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setErr('Título requerido');
      return;
    }
    if (!date) {
      setErr('Fecha requerida');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await createLogistics({
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
      toast.success('Movimiento creado');
      onCreated();
      reset();
      onClose();
    } else {
      setErr(res.error);
      toast.error(`Error: ${res.error}`);
    }
  };

  return (
    <DetailDrawer
      open={open}
      onClose={handleClose}
      title="Nuevo movimiento"
      testId="logistics-add-drawer"
      actions={
        <>
          <button
            type="button"
            onClick={handleClose}
            className="rounded border border-border px-3 py-1 text-meta text-fg hover:border-accent"
          >
            cancelar
          </button>
          <span className="flex-1" />
          <button
            type="button"
            data-testid="logistics-add-submit"
            disabled={busy}
            onClick={handleSubmit}
            className="rounded border border-accent bg-accent/10 px-3 py-1 text-meta text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {busy ? 'enviando…' : 'guardar'}
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
                data-testid={`log-type-${o.value}`}
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
            data-testid="log-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej. Vuelo AKL → MEL"
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg placeholder:text-fg-dim focus:border-accent focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col text-meta text-fg-muted">
            <span className="mb-1">Fecha *</span>
            <input
              data-testid="log-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex w-[140px] flex-col text-meta text-fg-muted">
            <span className="mb-1">Coste (NZD)</span>
            <input
              data-testid="log-cost"
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Ubicación</span>
          <input
            data-testid="log-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="ej. Auckland → Melbourne"
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg placeholder:text-fg-dim focus:border-accent focus:outline-none"
          />
        </label>

        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Estado</span>
          <div className="flex gap-1">
            {STATUSES.map((o) => (
              <button
                key={o.value}
                type="button"
                data-testid={`log-status-${o.value}`}
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
            data-testid="log-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="detalles opcionales"
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg placeholder:text-fg-dim focus:border-accent focus:outline-none"
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
