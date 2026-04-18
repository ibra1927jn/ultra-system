import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import {
  OpportunityListSchema,
  PipelineSchema,
  HighScoreSchema,
  type Opportunity,
  type Pipeline,
  type OppStatus,
} from './types';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: Opportunity[] };

type PipelineState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: Pipeline };

type Filters = {
  minScore?: number | undefined;
  status?: OppStatus | undefined;
  q?: string | undefined;
  limit?: number | undefined;
};

function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.minScore && f.minScore > 0) p.set('min_score', String(f.minScore));
  if (f.status) p.set('status', f.status);
  if (f.q && f.q.trim().length >= 2) p.set('q', f.q.trim());
  p.set('limit', String(f.limit ?? 50));
  return p.toString();
}

export function useOpportunities(filters: Filters): ListState & { refetch: () => void } {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const ctrlRef = useRef<AbortController | null>(null);
  const key = buildQuery(filters);

  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ status: 'loading' });
    apiFetch(`/api/opportunities?${key}`, OpportunityListSchema, { signal: ctrl.signal })
      .then((r) => setState({ status: 'ok', data: r.data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof ApiError ? err.message : 'unknown';
        setState({ status: 'error', error: msg });
      });
  }, [key]);

  useEffect(() => {
    load();
    return () => ctrlRef.current?.abort();
  }, [load]);

  return { ...state, refetch: load };
}

export function useHighScoreOpps(minScore = 8, limit = 5): ListState {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  useEffect(() => {
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ min_score: String(minScore), limit: String(limit) });
    apiFetch(`/api/opportunities/high-score?${qs}`, HighScoreSchema, { signal: ctrl.signal })
      .then((r) => setState({ status: 'ok', data: r.data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof ApiError ? err.message : 'unknown';
        setState({ status: 'error', error: msg });
      });
    return () => ctrl.abort();
  }, [minScore, limit]);
  return state;
}

export function usePipeline(): PipelineState & { refetch: () => void } {
  const [state, setState] = useState<PipelineState>({ status: 'loading' });
  const ctrlRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ status: 'loading' });
    apiFetch('/api/opportunities/pipeline', PipelineSchema, { signal: ctrl.signal })
      .then((r) => setState({ status: 'ok', data: r.data }))
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

  return { ...state, refetch: load };
}

// PATCH status — fire-and-forget con callback opcional para refetch.
export async function updateOpportunityStatus(
  id: number,
  status: OppStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/opportunities/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}
