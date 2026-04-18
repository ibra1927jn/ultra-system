import { t } from '@/i18n/t';
import { StatBlock } from '@/ui/StatBlock';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import {
  useDocuments,
  useTaxDeadlines,
  useVaccinations,
  useSchengen,
  useRecentMood,
} from './useMeData';

function badge(days: number | null, thresholds: [number, number]): 'alert' | 'warn' | 'info' | 'none' {
  if (days === null) return 'none';
  if (days < 0 || days < thresholds[0]) return 'alert';
  if (days < thresholds[1]) return 'warn';
  return 'info';
}

function daysNum(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function MeOverview() {
  const docs = useDocuments();
  const tax = useTaxDeadlines();
  const vacc = useVaccinations();
  const schengen = useSchengen();
  const mood = useRecentMood(7);

  const expiringDocs = docs.status === 'ok'
    ? docs.data.filter((d) => {
        const n = daysNum(d.days_remaining);
        return n !== null && n >= 0 && n <= 90;
      })
    : [];

  const expiringVacc = vacc.status === 'ok'
    ? vacc.data.filter((v) => {
        const n = daysNum(v.days_remaining);
        return n !== null && n >= 0 && n <= 60;
      })
    : [];

  const urgentTax = tax.status === 'ok'
    ? tax.data.filter((t) => {
        const n = daysNum(t.days_remaining);
        return n !== null && n >= 0 && n <= 30;
      })
    : [];

  const schengenDays = schengen.status === 'ok' ? schengen.data.days_remaining : null;
  // mood.data.averages.mood es el promedio (1-5 típicamente). El count es
  // cantidad de entries, no sirve como "moodAvg".
  const moodAvgRaw =
    mood.status === 'ok' && mood.data.count > 0 && mood.data.averages
      ? mood.data.averages.mood
      : null;
  const moodAvg = (() => {
    if (moodAvgRaw === null || moodAvgRaw === undefined) return null;
    const n = typeof moodAvgRaw === 'number' ? moodAvgRaw : parseFloat(moodAvgRaw);
    return Number.isFinite(n) ? n.toFixed(1) : null;
  })();

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatBlock
          testId="me-kpi-docs"
          kpi={expiringDocs.length}
          label={t('me.kpi.expiring')}
          badge={expiringDocs.length > 0 ? 'warn' : 'info'}
        />
        <StatBlock
          testId="me-kpi-vacc"
          kpi={expiringVacc.length}
          label={t('me.kpi.vaccines')}
          badge={expiringVacc.length > 0 ? 'warn' : 'info'}
        />
        <StatBlock
          testId="me-kpi-tax"
          kpi={urgentTax.length}
          label={t('me.kpi.tax')}
          badge={urgentTax.length > 0 ? 'alert' : 'info'}
        />
        <StatBlock
          testId="me-kpi-schengen"
          kpi={schengenDays !== null ? schengenDays : '—'}
          label={t('me.kpi.schengen')}
          badge={badge(schengenDays, [15, 60])}
        />
        <StatBlock
          testId="me-kpi-mood"
          kpi={moodAvg ?? '—'}
          label={t('me.kpi.mood')}
          badge="info"
        />
      </section>

      <section aria-label="docs">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('me.docs.title')}</h2>
        {docs.status === 'loading' && <LoadingState />}
        {docs.status === 'error' && <ErrorState message={docs.error} />}
        {docs.status === 'ok' && expiringDocs.length === 0 && (
          <EmptyState title={t('me.docs.empty')} />
        )}
        {docs.status === 'ok' && expiringDocs.length > 0 && (
          <div className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {expiringDocs.slice(0, 5).map((d) => (
              <ListRow
                key={d.id}
                testId={`me-doc-${d.id}`}
                title={d.document_name}
                subtitle={d.document_type ?? ''}
                trailing={daysNum(d.days_remaining) !== null ? `T-${daysNum(d.days_remaining)}d` : '—'}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="tax">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('me.tax.title')}</h2>
        {tax.status === 'loading' && <LoadingState />}
        {tax.status === 'error' && <ErrorState message={tax.error} />}
        {tax.status === 'ok' && urgentTax.length === 0 && (
          <EmptyState title={t('me.tax.empty')} />
        )}
        {tax.status === 'ok' && urgentTax.length > 0 && (
          <div className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {urgentTax.slice(0, 5).map((t) => (
              <ListRow
                key={t.id}
                testId={`me-tax-${t.id}`}
                title={t.name}
                subtitle={t.country ?? ''}
                trailing={daysNum(t.days_remaining) !== null ? `T-${daysNum(t.days_remaining)}d` : '—'}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
