import { t } from '@/i18n/t';
import { useHomeOverview } from './useHomeOverview';
import { MustDoStrip } from '@/ui/MustDoStrip';
import { HomeCard } from '@/ui/HomeCard';
import type { Section } from '@/lib/zod-schemas';
import type { TranslationKey } from '@/i18n/es';

const SECTIONS: ReadonlyArray<{
  key: 'me' | 'work' | 'money' | 'moves' | 'world';
  href: string;
  label: TranslationKey;
}> = [
  { key: 'me', href: '/app/me', label: 'home.section.me' },
  { key: 'work', href: '/app/work', label: 'home.section.work' },
  { key: 'money', href: '/app/money', label: 'home.section.money' },
  { key: 'moves', href: '/app/moves', label: 'home.section.moves' },
  { key: 'world', href: '/app/world', label: 'home.section.world' },
];

export default function HomePage() {
  const state = useHomeOverview();

  const mustDoProps =
    state.status === 'loading'
      ? ({ status: 'loading' } as const)
      : state.status === 'error'
        ? ({ status: 'error', error: state.error } as const)
        : ({ status: 'ok', items: state.data.mustDo } as const);

  const sectionFor = (key: (typeof SECTIONS)[number]['key']): Section | null =>
    state.status === 'ok' ? state.data[key] : null;

  return (
    <div className="mx-auto max-w-7xl p-8 space-y-8">
      <h1 className="text-section">{t('home.title')}</h1>
      {state.status === 'ok' && state.data.partial && (
        <p data-testid="partial-banner" className="text-attention text-meta">
          datos parciales
        </p>
      )}

      <MustDoStrip {...mustDoProps} />

      <section
        aria-label="sections"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5"
      >
        {SECTIONS.map((s) => (
          <HomeCard
            key={s.key}
            sectionKey={s.key}
            href={s.href}
            label={t(s.label)}
            section={sectionFor(s.key)}
          />
        ))}
      </section>
    </div>
  );
}
