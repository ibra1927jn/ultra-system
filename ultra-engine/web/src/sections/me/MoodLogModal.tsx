import { useState } from 'react';
import { DetailDrawer } from '@/ui/DetailDrawer';
import { useToast } from '@/ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
};

type State = 'idle' | 'submitting' | 'error' | 'ok';

async function postMood(payload: {
  mood: number;
  energy: number | null;
  anxiety: number | null;
  notes: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/bio/mood', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

// Flow mobile-first para registrar mood en 5 segundos. 3 sliders + notas opcionales.
// Defaults a 5 (neutro) para reducir fricción. El usuario suele sólo mover mood.
export function MoodLogModal({ open, onClose, onLogged }: Props) {
  const [mood, setMood] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [anxiety, setAnxiety] = useState(5);
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const toast = useToast();

  const reset = () => {
    setMood(5);
    setEnergy(5);
    setAnxiety(5);
    setNotes('');
    setState('idle');
    setErrMsg(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setState('submitting');
    const res = await postMood({
      mood,
      energy,
      anxiety,
      notes: notes.trim().length > 0 ? notes.trim() : null,
    });
    if (res.ok) {
      setState('ok');
      toast.success(`Mood ${mood}/10 guardado`);
      onLogged();
      window.setTimeout(() => {
        reset();
        onClose();
      }, 600);
    } else {
      setState('error');
      setErrMsg(res.error);
      toast.error(`Error: ${res.error}`);
    }
  };

  return (
    <DetailDrawer
      open={open}
      onClose={handleClose}
      title="Mood log · 5 segundos"
      testId="mood-log-drawer"
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
            data-testid="mood-log-submit"
            disabled={state === 'submitting' || state === 'ok'}
            onClick={handleSubmit}
            className="rounded border border-accent bg-accent/10 px-3 py-1 text-meta text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {state === 'submitting' ? 'enviando…' : state === 'ok' ? '✓ guardado' : 'guardar'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Slider label="Mood" value={mood} onChange={setMood} testId="mood-slider" />
        <Slider label="Energía" value={energy} onChange={setEnergy} testId="energy-slider" />
        <Slider label="Ansiedad" value={anxiety} onChange={setAnxiety} testId="anxiety-slider" />
        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Notas (opcional)</span>
          <textarea
            data-testid="mood-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="¿Qué ha pasado hoy?"
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg placeholder:text-fg-dim focus:border-accent focus:outline-none"
          />
          <span className="mt-1 text-fg-dim">{notes.length}/500</span>
        </label>
        {state === 'error' && (
          <p className="text-meta text-critical" role="alert">
            Error: {errMsg}
          </p>
        )}
      </div>
    </DetailDrawer>
  );
}

function Slider({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  testId: string;
}) {
  return (
    <label className="flex flex-col text-meta text-fg-muted">
      <span className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-kpi-sm text-fg" data-testid={`${testId}-value`}>
          {value}/10
        </span>
      </span>
      <input
        data-testid={testId}
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 5)}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-bg-elev accent-accent"
      />
    </label>
  );
}
