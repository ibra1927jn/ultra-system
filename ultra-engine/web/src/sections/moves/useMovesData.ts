import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { ZodSchema } from 'zod';
import {
  LogisticsListSchema,
  Next48hSchema,
  MembershipListSchema,
} from './types';
import type { LogisticsItem, Membership } from './types';

type State<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: T };

function useSchemaEndpoint<T>(
  path: string,
  schema: ZodSchema<T>,
): State<T> & { refetch: () => void } {
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

export function useUpcoming() {
  const res = useSchemaEndpoint('/api/logistics/upcoming', LogisticsListSchema);
  if (res.status !== 'ok') return res;
  return { ...res, data: res.data.data } as State<LogisticsItem[]> & { refetch: () => void };
}

export function useNext48h() {
  return useSchemaEndpoint('/api/logistics/next48h', Next48hSchema);
}

export function useMemberships() {
  const res = useSchemaEndpoint('/api/logistics/memberships', MembershipListSchema);
  if (res.status !== 'ok') return res;
  return { ...res, data: res.data.data } as State<Membership[]> & { refetch: () => void };
}

// POIs deferred hasta que la sección tenga un selector de coordenadas.
// PoiListSchema y Poi sí se exportan desde types.ts por si se usa en fases siguientes.
