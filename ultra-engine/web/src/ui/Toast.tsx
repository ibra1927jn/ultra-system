import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Variant = 'success' | 'error' | 'info';

type Toast = {
  id: number;
  message: string;
  variant: Variant;
};

type Ctx = {
  push: (message: string, variant?: Variant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);

const NOOP_CTX: Ctx = {
  push: () => undefined,
  success: () => undefined,
  error: () => undefined,
  info: () => undefined,
};

// En tests sin provider, useToast devuelve un no-op. En prod el App monta
// <ToastProvider> globalmente, así que siempre habrá ctx real.
export function useToast(): Ctx {
  return useContext(ToastContext) ?? NOOP_CTX;
}

const VARIANT_CLASS: Record<Variant, string> = {
  success: 'border-accent bg-bg-panel text-accent',
  error: 'border-critical bg-bg-panel text-critical',
  info: 'border-border bg-bg-panel text-fg',
};

const VARIANT_ICON: Record<Variant, string> = {
  success: '✓',
  error: '⚠',
  info: 'ℹ',
};

const AUTO_DISMISS_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: Variant = 'info') => {
      const id = ++idRef.current;
      setToasts((curr) => [...curr, { id, message, variant }]);
      window.setTimeout(() => remove(id), AUTO_DISMISS_MS);
    },
    [remove],
  );

  const ctx: Ctx = {
    push,
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div
        aria-live="polite"
        data-testid="toast-stack"
        className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid={`toast-${t.variant}`}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg ${VARIANT_CLASS[t.variant]}`}
          >
            <span aria-hidden className="shrink-0 text-kpi-sm">
              {VARIANT_ICON[t.variant]}
            </span>
            <span className="flex-1 text-meta">{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="cerrar"
              className="shrink-0 text-meta text-fg-dim hover:text-fg"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Progressive auto-dismiss: los toasts expirados se eliminan vía setTimeout
// (ver push). Este useEffect garantiza que si el component unmounta limpia
// intervals pendientes — no hace falta porque setTimeout está ligado al id,
// y remove() es idempotente. Dejado aquí para clarity de patrón.
export function noop() {
  useEffect(() => undefined, []);
}
