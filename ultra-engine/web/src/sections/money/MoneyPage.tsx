import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZodSchema } from 'zod';
import { t } from '@/i18n/t';
import { apiFetch, ApiError } from '@/lib/api';
import { SectionShell } from '@/ui/SectionShell';
import { StatBlock } from '@/ui/StatBlock';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { SummarySchema, RunwaySchema } from './types';

// Money es un thin wrapper intencional:
// el cockpit completo (/money.html — 14 paneles, 6 workspaces, 3500 LOC)
// está fuera de la SPA de momento. /app/money resume los 4 KPIs principales
// + top categorías + CTA al cockpit. Migración full queda para fase posterior.

type State<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; data: T };

function useEndpoint<T>(path: string, schema: ZodSchema<T>): State<T> {
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

  return state;
}

function toNum(v: number | string): number {
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

export default function MoneyPage() {
  const summary = useEndpoint('/api/finances/summary', SummarySchema);
  const runway = useEndpoint('/api/finances/runway', RunwaySchema);

  const balance = summary.status === 'ok' ? toNum(summary.data.data.balance) : null;
  const runwayDays = runway.status === 'ok' ? runway.data.data.runway_days_90d : null;
  const burn90 = runway.status === 'ok' ? runway.data.data.burn_rate_90d : null;
  const netWorth =
    runway.status === 'ok' && runway.data.data.net_worth_snapshot
      ? Number(runway.data.data.net_worth_snapshot.total_nzd) || null
      : null;

  const topCategories =
    summary.status === 'ok'
      ? summary.data.data.byCategory
          .filter((c) => c.type === 'expense')
          .sort((a, b) => toNum(b.total) - toNum(a.total))
          .slice(0, 5)
      : [];

  return (
    <SectionShell
      title={t('money.title')}
      subtitle={t('money.subtitle')}
      testId="money-page"
      actions={
        <a
          href="/money.html"
          className="rounded border border-accent px-3 py-2 text-meta text-accent hover:bg-accent/10"
        >
          {t('money.cockpit.cta')}
        </a>
      }
    >
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBlock
          testId="money-kpi-balance"
          kpi={balance !== null ? Math.round(balance) : '—'}
          label={t('money.kpi.balance')}
          badge={balance !== null && balance < 0 ? 'alert' : 'info'}
        />
        <StatBlock
          testId="money-kpi-runway"
          kpi={runwayDays ?? '—'}
          label={t('money.kpi.runway')}
          badge={runwayDays !== null && runwayDays < 0 ? 'alert' : 'info'}
        />
        <StatBlock
          testId="money-kpi-burn90"
          kpi={burn90 !== null ? Math.round(burn90) : '—'}
          label={t('money.kpi.burn90')}
          badge="info"
        />
        <StatBlock
          testId="money-kpi-nw"
          kpi={netWorth !== null ? Math.round(netWorth) : '—'}
          label={t('money.kpi.netWorth')}
          badge="info"
        />
      </section>

      <section className="mt-6" aria-label="top-categories">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('money.expense.title')}</h2>
        {summary.status === 'loading' && <LoadingState />}
        {summary.status === 'error' && <ErrorState message={summary.error} />}
        {summary.status === 'ok' && topCategories.length === 0 && (
          <EmptyState title={t('money.empty')} />
        )}
        {summary.status === 'ok' && topCategories.length > 0 && (
          <div
            data-testid="money-categories-list"
            className="space-y-1 rounded-lg border border-border bg-bg-panel p-2"
          >
            {topCategories.map((c) => (
              <ListRow
                key={c.category}
                testId={`money-cat-${c.category}`}
                title={c.category}
                subtitle={`${c.count} txns`}
                trailing={`${Math.round(toNum(c.total))}`}
              />
            ))}
          </div>
        )}
      </section>
    </SectionShell>
  );
}
