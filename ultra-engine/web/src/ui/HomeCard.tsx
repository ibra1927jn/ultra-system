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

export function HomeCard({ sectionKey, href, label, section }: Props) {
  const subtext = !section
    ? '—'
    : section.status === 'error'
      ? '⚠ error'
      : section.status === 'empty'
        ? '—'
        : (section.label ?? '');

  const kpi = section && section.status === 'ok' ? section.kpi : null;

  return (
    <Link
      to={href}
      data-testid={`home-card-${sectionKey}`}
      className="rounded-lg border border-border bg-bg-panel p-6 transition hover:border-accent hover:bg-bg-elev"
    >
      <div className="text-card-title">{label}</div>
      {kpi !== null && (
        <div data-testid={`home-card-${sectionKey}-kpi`} className="mt-2 text-section">
          {kpi}
        </div>
      )}
      <div className={`mt-2 text-meta ${section ? BADGE_CLASS[section.badge] : 'text-fg-dim'}`}>
        {subtext}
      </div>
    </Link>
  );
}
