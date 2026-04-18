import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Badge flotante con count de mustDo items. Vive como overlay fijo en top-right
// de la viewport (por debajo del topbar). Click → /app (Home).
// Implementado aparte del TopBar para evitar re-mounts en ese component.
export function MustDoBadge() {
  const [count, setCount] = useState<number | null>(null);
  const [highCount, setHighCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/home/overview', { credentials: 'include' });
        if (!res.ok) return;
        const body = (await res.json()) as { mustDo?: Array<{ severity: string }> };
        if (cancelled) return;
        const items = body.mustDo ?? [];
        setCount(items.length);
        setHighCount(items.filter((i) => i.severity === 'high').length);
      } catch {
        // ignore
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (count === null || count === 0) return null;

  const cls = highCount > 0 ? 'bg-critical/20 text-critical' : 'bg-attention/20 text-attention';

  return (
    <Link
      to="/app"
      data-testid="mustdo-badge-fab"
      aria-label={`${count} items urgentes — ir a home`}
      className={`fixed right-4 top-16 z-30 inline-flex items-center gap-2 rounded-full border border-border ${cls} px-3 py-1.5 text-meta shadow-lg backdrop-blur`}
    >
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bg-base/60 px-1 text-card-title">
        {count}
      </span>
      <span>urgentes</span>
      {highCount > 0 && (
        <span className="rounded bg-critical/30 px-1.5 py-0.5 text-meta text-critical">
          {highCount} críticos
        </span>
      )}
    </Link>
  );
}
