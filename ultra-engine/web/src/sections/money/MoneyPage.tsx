import { t } from '@/i18n/t';
import { useEndpoint } from '@/lib/useEndpoint';
import { SectionShell } from '@/ui/SectionShell';
import { StatBlock } from '@/ui/StatBlock';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { Sparkline } from '@/ui/Sparkline';
import {
  SummarySchema,
  RunwaySchema,
  NwTimelineSchema,
  MarketsSnapshotSchema,
  FxSchema,
} from './types';

// Money es un thin wrapper: cockpit completo vive en /money.html.
// Aquí: 4 KPIs + top categorías + NW sparkline + mini markets + FX snapshot
// + CTA al cockpit. Se conecta al worldmonitor via /api/wm/markets/snapshot
// (cross-pilar money↔world).

function toNum(v: number | string | null): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

function fmtPct(v: number | string | null): string {
  const n = toNum(v);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export default function MoneyPage() {
  const summary = useEndpoint('/api/finances/summary', SummarySchema);
  const runway = useEndpoint('/api/finances/runway', RunwaySchema);
  const nw = useEndpoint('/api/finances/nw-timeline?days=30', NwTimelineSchema);
  const markets = useEndpoint('/api/wm/markets/snapshot', MarketsSnapshotSchema);
  const fx = useEndpoint('/api/finances/fx', FxSchema);

  const balance = summary.status === 'ok' ? toNum(summary.data.data.balance) : null;
  const runwayDays = runway.status === 'ok' ? runway.data.data.runway_days_90d : null;
  const burn90 = runway.status === 'ok' ? runway.data.data.burn_rate_90d : null;
  const netWorth =
    runway.status === 'ok' && runway.data.data.net_worth_snapshot
      ? Number(runway.data.data.net_worth_snapshot.total_nzd) || null
      : null;

  const nwSeries: number[] =
    nw.status === 'ok'
      ? nw.data.data.map((p) => toNum(p.total_nzd as string | number)).filter((n) => Number.isFinite(n))
      : [];
  const nwTrend = nw.status === 'ok' ? nw.data.trend : null;

  const topCategories =
    summary.status === 'ok'
      ? summary.data.data.byCategory
          .filter((c) => c.type === 'expense')
          .sort((a, b) => toNum(b.total) - toNum(a.total))
          .slice(0, 5)
      : [];

  const marketsList =
    markets.status === 'ok' ? (markets.data.data.indices ?? []).slice(0, 4) : [];
  const fxList = fx.status === 'ok' ? fx.data.data.slice(0, 6) : [];

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

      {nwSeries.length >= 2 && (
        <section
          className="mt-6 rounded-lg border border-border bg-bg-panel p-4"
          aria-label="nw-trend"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-meta text-fg-muted">
                Net Worth · últimos {nwSeries.length} snapshots
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-kpi-sm text-fg">
                  {Math.round(nwSeries[nwSeries.length - 1] ?? 0).toLocaleString()} NZD
                </span>
                {nwTrend && (
                  <span
                    data-testid="money-nw-delta"
                    className={
                      toNum(nwTrend.delta_pct) >= 0 ? 'text-meta text-accent' : 'text-meta text-critical'
                    }
                  >
                    {fmtPct(nwTrend.delta_pct)}
                  </span>
                )}
              </div>
            </div>
            <Sparkline
              values={nwSeries}
              width={320}
              height={40}
              color={toNum(nwTrend?.delta_pct ?? 0) >= 0 ? 'var(--accent, #22d3ae)' : 'var(--critical, #ef4444)'}
              testId="money-nw-sparkline"
              ariaLabel={`NW últimos ${nwSeries.length} snapshots`}
            />
          </div>
        </section>
      )}

      <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-bg-panel p-4" aria-label="markets">
          <h2 className="mb-3 text-card-title text-fg-muted">Mercados</h2>
          {markets.status === 'loading' && <LoadingState />}
          {markets.status === 'error' && <ErrorState message={markets.error} />}
          {markets.status === 'ok' && marketsList.length > 0 && (
            <div data-testid="money-markets-list" className="space-y-1">
              {marketsList.map((ix) => (
                <div
                  key={ix.symbol}
                  data-testid={`money-mkt-${ix.symbol}`}
                  className="flex items-center justify-between text-card-title"
                >
                  <span className="text-fg-muted">{ix.display}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-fg">{Number(ix.price).toFixed(2)}</span>
                    <span
                      className={
                        toNum(ix.change_pct) >= 0 ? 'text-meta text-accent' : 'text-meta text-critical'
                      }
                    >
                      {fmtPct(ix.change_pct)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-bg-panel p-4" aria-label="fx">
          <h2 className="mb-3 text-card-title text-fg-muted">FX · base NZD</h2>
          {fx.status === 'loading' && <LoadingState />}
          {fx.status === 'error' && <ErrorState message={fx.error} />}
          {fx.status === 'ok' && fxList.length > 0 && (
            <div data-testid="money-fx-list" className="grid grid-cols-2 gap-2">
              {fxList.map((f) => (
                <div key={f.quote} className="flex items-center justify-between text-meta">
                  <span className="text-fg-muted">{f.quote}</span>
                  <span className="text-fg">{Number(f.rate).toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
