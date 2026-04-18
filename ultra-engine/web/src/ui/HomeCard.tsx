import { Link } from 'react-router-dom';
import type { Section } from '@/lib/zod-schemas';

type Props = {
  sectionKey: 'me' | 'work' | 'money' | 'moves' | 'world';
  href: string;
  label: string;
  section: Section | null; // null mientras loading
};

const BADGE_CLASS: Record<Section['badge'], string> = {
  none: 'text-fg-dim',
  info: 'text-fg-muted',
  warn: 'text-attention',
  alert: 'text-critical',
};

const BADGE_DOT: Record<Section['badge'], string> = {
  none: 'bg-fg-dim',
  info: 'bg-accent',
  warn: 'bg-attention',
  alert: 'bg-critical',
};

export function HomeCard({ sectionKey, href, label, section }: Props) {
  const subtext = !section
    ? '—'
    : section.status === 'error'
      ? '⚠ error'
      : section.status === 'empty'
        ? '—'
        : (section.label ?? '');

  const kpi = section && section.status === 'ok' ? section.kpi : null;
  const preview = section && section.status === 'ok' ? section.preview : null;
  const badge: Section['badge'] = section ? section.badge : 'none';

  return (
    <Link
      to={href}
      data-testid={`home-card-${sectionKey}`}
      className="flex flex-col rounded-lg border border-border bg-bg-panel p-6 transition hover:border-accent hover:bg-bg-elev"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-card-title">{label}</span>
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${BADGE_DOT[badge]}`} />
      </div>

      {kpi !== null && (
        <div data-testid={`home-card-${sectionKey}-kpi`} className="mt-2 text-section">
          {kpi}
        </div>
      )}
      <div className={`mt-2 text-meta ${BADGE_CLASS[badge]}`}>
        {subtext}
      </div>

      {preview && preview.length > 0 && (
        <ul
          data-testid={`home-card-${sectionKey}-preview`}
          className="mt-4 space-y-1 border-t border-border pt-3"
        >
          {preview.slice(0, 3).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-meta text-fg">{p.text}</span>
              {p.meta && <span className="shrink-0 text-meta text-fg-dim">{p.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
