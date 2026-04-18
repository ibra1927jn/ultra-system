import { t } from '@/i18n/t';
import { StatBlock } from '@/ui/StatBlock';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useNext48h, useMemberships } from './useMovesData';

function daysNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function MovesOverview() {
  const next48 = useNext48h();
  const memberships = useMemberships();

  const next48Count = next48.status === 'ok' ? next48.data.count : null;
  const next48Critical = next48.status === 'ok' ? next48.data.summary.critical : null;

  const activeMemberships = memberships.status === 'ok'
    ? memberships.data.filter((m) => m.is_active !== false).length
    : null;

  const renewingSoon = memberships.status === 'ok'
    ? memberships.data.filter((m) => {
        const d = daysNum(m.days_to_renewal);
        return d !== null && d <= 60 && d >= 0;
      }).length
    : null;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBlock
          testId="moves-kpi-48h"
          kpi={next48Count ?? '—'}
          label={t('moves.kpi.next48h')}
          badge={next48Count && next48Count > 0 ? 'info' : 'none'}
        />
        <StatBlock
          testId="moves-kpi-critical"
          kpi={next48Critical ?? '—'}
          label={t('moves.kpi.critical')}
          badge={next48Critical && next48Critical > 0 ? 'alert' : 'none'}
        />
        <StatBlock
          testId="moves-kpi-memberships"
          kpi={activeMemberships ?? '—'}
          label={t('moves.kpi.memberships')}
          badge="info"
        />
        <StatBlock
          testId="moves-kpi-renewals"
          kpi={renewingSoon ?? '—'}
          label={t('moves.kpi.renewals')}
          badge={renewingSoon && renewingSoon > 0 ? 'warn' : 'none'}
        />
      </section>

      <section aria-label="next-48h">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('moves.kpi.next48h')}</h2>
        {next48.status === 'loading' && <LoadingState />}
        {next48.status === 'error' && <ErrorState message={next48.error} />}
        {next48.status === 'ok' && next48.data.count === 0 && (
          <EmptyState title={t('moves.upcoming.empty')} />
        )}
        {next48.status === 'ok' && next48.data.count > 0 && (
          <div className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {next48.data.data.slice(0, 5).map((i) => (
              <ListRow
                key={i.id}
                testId={`moves-48-${i.id}`}
                title={i.title ?? i.type ?? 'evento'}
                subtitle={i.location ?? ''}
                trailing={i.urgency ?? (daysNum(i.days_until) !== null ? `T-${daysNum(i.days_until)}d` : '—')}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
