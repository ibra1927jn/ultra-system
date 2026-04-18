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

export function MustDoStrip(props: Props) {
  return (
    <section
      aria-label={t('home.mustdo.label')}
      data-testid="mustdo-strip"
      className="rounded-lg border border-border bg-bg-panel p-6"
    >
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
        <ul className="space-y-2">
          {props.items.slice(0, 5).map((item) => (
            <li key={item.id} className={`text-card-title ${SEV_CLASS[item.severity]}`}>
              {item.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
