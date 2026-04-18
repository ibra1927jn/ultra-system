import { Link } from 'react-router-dom';
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

// Saludo por hora local del navegador. Despierta/tarde/noche.
function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatToday(date: Date): string {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}

type QuickStart = { label: string; href: string; testId: string };

// Si las 5 secciones están empty (primer acceso), mostramos 3 CTAs
// onboarding en lugar del grid. Baja fricción para que el usuario dé
// el primer paso.
const ONBOARDING_QUICK_STARTS: ReadonlyArray<QuickStart> = [
  { label: 'Registra tu primer mood · 5s', href: '/app/me/bio?action=log', testId: 'home-onboard-mood' },
  { label: 'Añade un gasto/ingreso', href: '/app/money?action=add', testId: 'home-onboard-expense' },
  { label: 'Añade un movimiento (vuelo, visa, cita)', href: '/app/moves/upcoming?action=add', testId: 'home-onboard-move' },
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

  // Empty si todas las sections devuelven status empty y no hay mustDo.
  const allEmpty =
    state.status === 'ok' &&
    state.data.mustDo.length === 0 &&
    SECTIONS.every((s) => state.data[s.key].status === 'empty');

  const now = new Date();

  return (
    <div className="mx-auto max-w-7xl p-8 space-y-6">
      <header>
        <p data-testid="home-greeting" className="text-meta text-fg-muted">
          {greetingFor(now)} · {formatToday(now)}
        </p>
        <h1 className="mt-1 text-section">{t('home.title')}</h1>
      </header>

      {state.status === 'ok' && state.data.partial && (
        <p data-testid="partial-banner" className="text-attention text-meta">
          datos parciales — una fuente no respondió
        </p>
      )}

      {allEmpty && (
        <section
          aria-label="onboarding"
          data-testid="home-onboarding"
          className="rounded-lg border border-accent/30 bg-accent/5 p-6"
        >
          <h2 className="text-card-title text-accent">Empieza por aquí</h2>
          <p className="mt-1 text-meta text-fg-muted">
            El Mission Control se llena con tus datos. 3 ideas para arrancar:
          </p>
          <ul className="mt-3 space-y-2">
            {ONBOARDING_QUICK_STARTS.map((qs) => (
              <li key={qs.testId}>
                <Link
                  to={qs.href}
                  data-testid={qs.testId}
                  className="flex items-center justify-between rounded border border-border bg-bg-panel px-4 py-3 text-card-title text-fg transition hover:border-accent"
                >
                  <span>{qs.label}</span>
                  <span className="text-accent">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
