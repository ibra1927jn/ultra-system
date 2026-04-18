import { useEffect } from 'react';
import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  testId?: string;
};

// Slide-in panel desde la derecha. Cierre con ESC o click en el overlay.
// No usa portal — se renderiza inline. Si se complica con focus-trap,
// migrar a Radix Dialog.
export function DetailDrawer({ open, onClose, title, children, actions, testId }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid={testId ?? 'detail-drawer'}
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="flex-1 bg-black/50"
      />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-border bg-bg-panel shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <h2 className="text-card-title line-clamp-2">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-border px-2 py-1 text-meta text-fg-muted hover:border-accent hover:text-fg"
          >
            cerrar
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {actions && (
          <footer className="flex flex-wrap gap-2 border-t border-border p-4">
            {actions}
          </footer>
        )}
      </aside>
    </div>
  );
}
