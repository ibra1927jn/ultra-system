import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZodSchema } from 'zod';
import { apiFetch, ApiError } from './api';

export type EndpointState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: T };

// Hook genérico reutilizable para un endpoint que devuelve un envelope
// validado por Zod. schemaRef estable evita re-renders por closure.
//
// path = null → no fetch (útil para hooks condicionales). refetch siempre
// disponible. abort on unmount.
export function useEndpoint<T>(
  path: string | null,
  schema: ZodSchema<T>,
): EndpointState<T> & { refetch: () => void } {
  const [state, setState] = useState<EndpointState<T>>(() =>
    path === null ? { status: 'ok', data: null as unknown as T } : { status: 'loading' },
  );
  const ctrlRef = useRef<AbortController | null>(null);
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const load = useCallback(() => {
    if (path === null) return;
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
