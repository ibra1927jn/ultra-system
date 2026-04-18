import { useEffect } from 'react';

// Al volver a hacer visible la pestaña (tras cambiar app/ventana), dispara
// refetch si han pasado más de `minIntervalMs` desde el último refetch
// (evita spam cuando se hace quick-switch).
export function useVisibilityRefetch(
  refetch: (() => void) | undefined,
  minIntervalMs = 30_000,
): void {
  useEffect(() => {
    if (!refetch) return;
    let lastAt = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastAt < minIntervalMs) return;
      lastAt = Date.now();
      refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch, minIntervalMs]);
}
