import { NavLink } from 'react-router-dom';
import { t } from '@/i18n/t';

const SECTIONS = [
  { to: '/app', label: 'nav.home', key: 'h', testId: 'topbar-home' },
  { to: '/app/me', label: 'nav.me', key: 'e', testId: 'topbar-me' },
  { to: '/app/work', label: 'nav.work', key: 'w', testId: 'topbar-work' },
  { to: '/app/money', label: 'nav.money', key: 'm', testId: 'topbar-money' },
  { to: '/app/moves', label: 'nav.moves', key: 'v', testId: 'topbar-moves' },
  { to: '/app/world', label: 'nav.world', key: 'g', testId: 'topbar-world' },
] as const;

export type TopBarSection = (typeof SECTIONS)[number];

// Mapa público para el listener de teclado en App.tsx.
export const TOPBAR_SECTIONS = SECTIONS;

type TopBarProps = {
  onOpenPalette?: () => void;
};

export function TopBar({ onOpenPalette }: TopBarProps = {}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-1 border-b border-border bg-bg-base/90 px-6 py-3 backdrop-blur">
      <NavLink
        to="/app"
        end
        data-testid="topbar-brand"
        className="mr-6 text-card-title font-semibold text-fg hover:text-accent"
      >
        ULTRA
      </NavLink>
      <nav aria-label="main" className="flex flex-1 items-center gap-1">
        {SECTIONS.slice(1).map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={false}
            data-testid={s.testId}
            className={({ isActive }) =>
              [
                'rounded px-3 py-1.5 text-card-title transition',
                isActive
                  ? 'bg-bg-elev text-fg'
                  : 'text-fg-muted hover:bg-bg-elev hover:text-fg',
              ].join(' ')
            }
          >
            {t(s.label)}
            <span className="ml-2 hidden text-meta text-fg-dim md:inline">g·{s.key}</span>
          </NavLink>
        ))}
      </nav>
      {onOpenPalette && (
        <button
          type="button"
          onClick={onOpenPalette}
          data-testid="topbar-palette"
          className="ml-3 hidden items-center gap-2 rounded border border-border px-3 py-1 text-meta text-fg-muted hover:border-accent hover:text-fg md:inline-flex"
          aria-label="Abrir command palette"
        >
          <span>Buscar</span>
          <kbd className="rounded bg-bg-elev px-1.5 py-0.5 text-fg-dim">⌘K</kbd>
        </button>
      )}
    </header>
  );
}
