import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZodSchema } from 'zod';
import { apiFetch, ApiError } from './api';

// Contrato genérico de las páginas de sección lite (Fase 2):
//   { generatedAt, partial, data: <T> }
// El schema pasado a useSection valida el envelope completo.

export type SectionEnvelope<T> = {
  generatedAt: string;
  partial: boolean;
  data: T;
};

type State<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: T; partial: boolean; generatedAt: string };

export type UseSectionResult<T> = State<T> & { refetch: () => void };

export function useSection<T>(
  endpoint: string,
  schema: ZodSchema<SectionEnvelope<T>>,
): UseSectionResult<T> {
  const [state, setState] = useState<State<T>>({ status: 'loading' });
  const ctrlRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ status: 'loading' });
    apiFetch(endpoint, schema, { signal: ctrl.signal })
      .then((env) =>
        setState({
          status: 'ok',
          data: env.data,
          partial: env.partial,
          generatedAt: env.generatedAt,
        }),
      )
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof ApiError ? err.message : 'unknown';
        setState({ status: 'error', error: msg });
      });
  }, [endpoint, schema]);

  useEffect(() => {
    load();
    return () => ctrlRef.current?.abort();
  }, [load]);

  return { ...state, refetch: load };
}
