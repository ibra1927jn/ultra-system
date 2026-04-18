import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { HomeOverviewSchema, type HomeOverview } from '@/lib/zod-schemas';
import { useVisibilityRefetch } from '@/lib/useVisibilityRefetch';

type State =
  | { status: 'loading' }
  | { status: 'ok'; data: HomeOverview }
  | { status: 'error'; error: string };

export function useHomeOverview(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: 'loading' });
  const ctrlRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    apiFetch('/api/home/overview', HomeOverviewSchema, { signal: ctrl.signal })
      .then((data) => setState({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof ApiError ? err.message : 'unknown';
        setState({ status: 'error', error: msg });
      });
  }, []);

  useEffect(() => {
    load();
    return () => ctrlRef.current?.abort();
  }, [load]);

  // Al volver a la pestaña (tras >30s), refetch — mantiene home "live" sin spam.
  useVisibilityRefetch(load);

  return { ...state, refetch: load };
}
