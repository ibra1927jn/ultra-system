import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  testId?: string;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('data-focus-sentinel'),
  );
}

// Slide-in panel desde la derecha. ESC o click en overlay cierra.
// Focus trap: tab cycling queda capturado dentro del aside con sentinel
// nodes al inicio/fin, y el foco previo se restaura al cerrar.
export function DetailDrawer({ open, onClose, title, children, actions, testId }: Props) {
  const asideRef = useRef<HTMLElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const aside = asideRef.current;
    if (aside) {
      const first = focusableWithin(aside)[0];
      first?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sendTo = (where: 'first' | 'last') => () => {
    const aside = asideRef.current;
    if (!aside) return;
    const items = focusableWithin(aside);
    if (items.length === 0) return;
    (where === 'first' ? items[0] : items[items.length - 1]).focus();
  };

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
      <span
        data-focus-sentinel="start"
        data-testid="drawer-focus-sentinel-start"
        tabIndex={0}
        onFocus={sendTo('last')}
        className="sr-only"
      />
      <aside
        ref={asideRef}
        className="flex h-full w-full max-w-xl flex-col border-l border-border bg-bg-panel shadow-xl"
      >
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
      <span
        data-focus-sentinel="end"
        data-testid="drawer-focus-sentinel-end"
        tabIndex={0}
        onFocus={sendTo('first')}
        className="sr-only"
      />
    </div>
  );
}
