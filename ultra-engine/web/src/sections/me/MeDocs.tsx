import { t } from '@/i18n/t';
import { ListRow } from '@/ui/ListRow';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { useDocuments, useVaccinations, useTaxDeadlines } from './useMeData';

function daysNum(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function trailingDays(v: string | number | null): string {
  const n = daysNum(v);
  if (n === null) return '—';
  if (n < 0) return `${n}d (vencido)`;
  return `T-${n}d`;
}

export function MeDocs() {
  const docs = useDocuments();
  const vacc = useVaccinations();
  const tax = useTaxDeadlines();

  return (
    <div className="space-y-6">
      <section aria-label="documents">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('me.docs.title')}</h2>
        {docs.status === 'loading' && <LoadingState />}
        {docs.status === 'error' && <ErrorState message={docs.error} />}
        {docs.status === 'ok' && docs.data.length === 0 && (
          <EmptyState title={t('me.docs.empty')} />
        )}
        {docs.status === 'ok' && docs.data.length > 0 && (
          <div data-testid="me-docs-list" className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {docs.data.map((d) => (
              <ListRow
                key={d.id}
                testId={`me-doc-${d.id}`}
                title={d.document_name}
                subtitle={d.document_type ?? ''}
                trailing={trailingDays(d.days_remaining)}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="vaccinations">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('me.vaccines.title')}</h2>
        {vacc.status === 'loading' && <LoadingState />}
        {vacc.status === 'error' && <ErrorState message={vacc.error} />}
        {vacc.status === 'ok' && vacc.data.length === 0 && (
          <EmptyState title={t('me.vaccines.empty')} />
        )}
        {vacc.status === 'ok' && vacc.data.length > 0 && (
          <div data-testid="me-vacc-list" className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {vacc.data.map((v) => (
              <ListRow
                key={v.id}
                testId={`me-vacc-${v.id}`}
                title={`${v.vaccine}${v.dose_number ? ` · dosis ${v.dose_number}` : ''}`}
                subtitle={v.country ?? v.location ?? ''}
                trailing={trailingDays(v.days_remaining)}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="tax-deadlines">
        <h2 className="mb-3 text-card-title text-fg-muted">{t('me.tax.title')}</h2>
        {tax.status === 'loading' && <LoadingState />}
        {tax.status === 'error' && <ErrorState message={tax.error} />}
        {tax.status === 'ok' && tax.data.length === 0 && (
          <EmptyState title={t('me.tax.empty')} />
        )}
        {tax.status === 'ok' && tax.data.length > 0 && (
          <div data-testid="me-tax-list" className="space-y-1 rounded-lg border border-border bg-bg-panel p-2">
            {tax.data.slice(0, 30).map((row) => (
              <ListRow
                key={row.id}
                testId={`me-tax-${row.id}`}
                title={row.name}
                subtitle={row.country ?? ''}
                trailing={trailingDays(row.days_remaining)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
