import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import {
  DocumentListSchema,
  TaxDeadlineListSchema,
  VaccinationListSchema,
  SchengenSchema,
  MoodListSchema,
} from './types';
import type { MeDocument, TaxDeadline, Vaccination, MoodEntry } from './types';
import type { ZodSchema } from 'zod';

type State<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: T };

// Hook genérico apoyado en apiFetch (ya valida contra un Zod schema).
// Clave para evitar re-render loops: solo depende de `path` (string primitivo);
// el schema se asume estable al estar importado a nivel de módulo.
function useSchemaEndpoint<T>(path: string, schema: ZodSchema<T>): State<T> & { refetch: () => void } {
  const [state, setState] = useState<State<T>>({ status: 'loading' });
  const ctrlRef = useRef<AbortController | null>(null);
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ status: 'loading' });
    apiFetch(path, schemaRef.current, { signal: ctrl.signal })
      .then((data) => setState({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof ApiError ? err.message : 'unknown';
        setState({ status: 'error', error: msg });
      });
  }, [path]);

  useEffect(() => {
    load();
    return () => ctrlRef.current?.abort();
  }, [load]);

  return { ...state, refetch: load };
}

export function useDocuments() {
  const res = useSchemaEndpoint('/api/documents', DocumentListSchema);
  return mapList<typeof DocumentListSchema, MeDocument>(res);
}

export function useTaxDeadlines() {
  const res = useSchemaEndpoint('/api/bureaucracy/tax-deadlines', TaxDeadlineListSchema);
  return mapList<typeof TaxDeadlineListSchema, TaxDeadline>(res);
}

export function useVaccinations() {
  const res = useSchemaEndpoint('/api/bureaucracy/vaccinations', VaccinationListSchema);
  return mapList<typeof VaccinationListSchema, Vaccination>(res);
}

export function useSchengen() {
  const res = useSchemaEndpoint('/api/bureaucracy/schengen', SchengenSchema);
  return {
    ...('data' in res ? { ...res, data: res.data.data } : res),
  } as State<ReturnType<typeof SchengenSchema.parse>['data']> & { refetch: () => void };
}

export function useRecentMood(limit = 7) {
  const res = useSchemaEndpoint(`/api/bio/mood?limit=${limit}`, MoodListSchema);
  if (res.status !== 'ok') return res;
  return {
    ...res,
    data: { count: res.data.count, data: res.data.data },
  } as State<{ count: number; data: MoodEntry[] }> & { refetch: () => void };
}

// Helper: transforma State<{ ok, data }> → State<data>
function mapList<S, T>(
  res: State<{ ok: true; data: T[] }> & { refetch: () => void },
): State<T[]> & { refetch: () => void } {
  void ({} as S); // reserva el genérico para llamadas consistentes
  if (res.status !== 'ok') return res;
  return { ...res, data: res.data.data };
}
