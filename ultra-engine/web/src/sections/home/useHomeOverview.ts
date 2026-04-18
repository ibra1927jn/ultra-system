import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { HomeOverviewSchema, type HomeOverview } from '@/lib/zod-schemas';

type State =
  | { status: 'loading' }
  | { status: 'ok'; data: HomeOverview }
  | { status: 'error'; error: string };

export function useHomeOverview(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch('/api/home/overview', HomeOverviewSchema, { signal: ctrl.signal })
      .then((data) => setState({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof ApiError ? err.message : 'unknown';
        setState({ status: 'error', error: msg });
      });
    return () => ctrl.abort();
  }, []);

  return state;
}
