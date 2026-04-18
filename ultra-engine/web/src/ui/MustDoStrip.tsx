import { Link } from 'react-router-dom';
import { t } from '@/i18n/t';
import type { MustDoItem } from '@/lib/zod-schemas';

type Props =
  | { status: 'loading' }
  | { status: 'error'; error?: string }
  | { status: 'ok'; items: MustDoItem[] };

const SEV_CLASS: Record<MustDoItem['severity'], string> = {
  high: 'text-critical',
  med: 'text-attention',
  low: 'text-fg-muted',
};

const SEV_BORDER: Record<MustDoItem['severity'], string> = {
  high: 'border-l-critical',
  med: 'border-l-attention',
  low: 'border-l-fg-dim/30',
};

const SOURCE_LABEL: Record<MustDoItem['source'], string> = {
  bureaucracy: 'Fiscal',
  logistics: 'Movimiento',
  bio: 'Salud',
  money: 'Presupuesto',
};

function itemRow(item: MustDoItem) {
  const href = item.href;
  const isSpa = typeof href === 'string' && href.startsWith('/app/');
  const base =
    `flex items-center justify-between gap-3 rounded-md border-l-4 px-3 py-2 text-card-title transition ` +
    `${SEV_BORDER[item.severity]} ${SEV_CLASS[item.severity]} hover:bg-bg-elev`;
  const content = (
    <>
      <span className="truncate">{item.title}</span>
      <span className="shrink-0 text-meta text-fg-dim">{SOURCE_LABEL[item.source]}</span>
    </>
  );
  if (!href) return <span className={base}>{content}</span>;
  if (isSpa) {
    return (
      <Link
        to={href}
        className={base}
        data-testid={`mustdo-item-${item.id}`}
      >
        {content}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={base}
      data-testid={`mustdo-item-${item.id}`}
    >
      {content}
    </a>
  );
}

export function MustDoStrip(props: Props) {
  return (
    <section
      aria-label={t('home.mustdo.label')}
      data-testid="mustdo-strip"
      className="rounded-lg border border-border bg-bg-panel p-4"
    >
      <h2 className="mb-3 text-card-title text-fg-muted">{t('home.mustdo.label')}</h2>
      {props.status === 'loading' && (
        <p className="text-fg-muted text-meta">{t('home.loading')}</p>
      )}
      {props.status === 'error' && (
        <p className="text-critical text-meta">{t('home.error')}</p>
      )}
      {props.status === 'ok' && props.items.length === 0 && (
        <p className="text-fg-muted text-meta">{t('home.mustdo.empty')}</p>
      )}
      {props.status === 'ok' && props.items.length > 0 && (
        <ul className="space-y-1">
          {props.items.slice(0, 5).map((item) => (
            <li key={item.id}>{itemRow(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
