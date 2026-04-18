import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fuzzyMatch } from '@/lib/fuzzy';

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string; // ej "g·w" o "cockpit"
  perform: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: ReadonlyArray<PaletteItem>;
};

// Cmd+K palette. Abre con una lista de items ya enriquecida por el llamante.
// Flecha arriba/abajo + Enter + Escape.
export function CommandPalette({ open, onClose, items }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const scored = items
      .map((it) => ({ it, s: fuzzyMatch(q, `${it.label} ${it.hint ?? ''}`) }))
      .filter((x): x is { it: PaletteItem; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12);
    return scored.map((x) => x.it);
  }, [q, items]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        const pick = filtered[idx];
        if (pick) {
          e.preventDefault();
          pick.perform();
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, filtered, idx, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 w-full max-w-xl rounded-lg border border-border bg-bg-panel shadow-xl">
        <input
          ref={inputRef}
          data-testid="palette-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar sección o acción…"
          className="w-full rounded-t-lg border-b border-border bg-transparent px-4 py-3 text-card-title text-fg placeholder:text-fg-dim focus:outline-none"
        />
        <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <li className="p-4 text-center text-meta text-fg-muted">sin resultados</li>
          )}
          {filtered.map((it, i) => (
            <li
              key={it.id}
              role="option"
              aria-selected={i === idx}
              data-testid={`palette-item-${it.id}`}
              className={
                i === idx
                  ? 'flex cursor-pointer items-center justify-between rounded px-3 py-2 bg-bg-elev text-fg'
                  : 'flex cursor-pointer items-center justify-between rounded px-3 py-2 text-fg-muted hover:bg-bg-elev'
              }
              onMouseEnter={() => setIdx(i)}
              onClick={() => {
                it.perform();
                onClose();
              }}
            >
              <span className="truncate">{it.label}</span>
              {it.hint && <span className="ml-3 shrink-0 text-meta text-fg-dim">{it.hint}</span>}
            </li>
          ))}
        </ul>
        <footer className="flex items-center justify-between border-t border-border p-2 text-meta text-fg-dim">
          <span>↑↓ para mover</span>
          <span>enter para ir</span>
          <span>esc para cerrar</span>
        </footer>
      </div>
    </div>
  );
}

export function usePaletteItems(): ReadonlyArray<PaletteItem> {
  const navigate = useNavigate();
  return useMemo(
    () => [
      { id: 'home', label: 'Home', hint: 'g·h', perform: () => navigate('/app') },
      { id: 'me', label: 'Yo · Overview', hint: 'g·e', perform: () => navigate('/app/me') },
      { id: 'me-docs', label: 'Yo · Documentos', perform: () => navigate('/app/me/docs') },
      { id: 'me-bio', label: 'Yo · Bio + mood', perform: () => navigate('/app/me/bio') },
      { id: 'work', label: 'Trabajo · Overview', hint: 'g·w', perform: () => navigate('/app/work') },
      { id: 'work-matches', label: 'Trabajo · Matches (opps+jobs)', perform: () => navigate('/app/work/matches') },
      { id: 'work-pipeline', label: 'Trabajo · Pipeline', perform: () => navigate('/app/work/pipeline') },
      { id: 'money', label: 'Dinero · resumen', hint: 'g·m', perform: () => navigate('/app/money') },
      { id: 'moves', label: 'Movimientos · Overview', hint: 'g·v', perform: () => navigate('/app/moves') },
      { id: 'moves-upcoming', label: 'Movimientos · Próximos', perform: () => navigate('/app/moves/upcoming') },
      { id: 'moves-mem', label: 'Movimientos · Membresías', perform: () => navigate('/app/moves/memberships') },
      { id: 'moves-poi', label: 'Movimientos · POIs cerca', perform: () => navigate('/app/moves/poi') },
      { id: 'me-timeline', label: 'Yo · Timeline compliance', perform: () => navigate('/app/me/timeline') },
      { id: 'act-log-mood', label: '+ Log mood · 5s', hint: 'acción', perform: () => navigate('/app/me/bio?action=log') },
      { id: 'act-add-expense', label: '+ Añadir gasto/ingreso', hint: 'acción', perform: () => navigate('/app/money?action=add') },
      { id: 'act-add-move', label: '+ Añadir movimiento', hint: 'acción', perform: () => navigate('/app/moves/upcoming?action=add') },
      { id: 'world', label: 'Mundo · CTA a /worldmap.html', hint: 'g·g', perform: () => navigate('/app/world') },
      { id: 'worldmap', label: 'Legacy WorldMonitor (/worldmap.html)', hint: 'cockpit', perform: () => { window.location.href = '/worldmap.html'; } },
      { id: 'money-cockpit', label: 'Legacy Money Cockpit (/money.html)', hint: 'cockpit', perform: () => { window.location.href = '/money.html'; } },
    ],
    [navigate],
  );
}
