import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { t } from '@/i18n/t';
import { useToast } from '@/ui/Toast';

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

async function fetchMe(signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include', signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok: boolean; email?: string };
    return body.ok && body.email ? body.email : null;
  } catch {
    return null;
  }
}

async function postLogout(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

export function TopBar({ onOpenPalette }: TopBarProps = {}) {
  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMe(ctrl.signal).then(setEmail);
    return () => ctrl.abort();
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    const ok = await postLogout();
    if (ok) {
      toast.success('Sesión cerrada');
      window.setTimeout(() => {
        window.location.href = '/login.html';
      }, 500);
    } else {
      toast.error('Error al cerrar sesión');
    }
  };

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
      <div className="relative ml-2">
        <button
          type="button"
          data-testid="topbar-user"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded border border-border px-2 py-1 text-meta text-fg-muted hover:border-accent hover:text-fg"
        >
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-bg-elev text-fg"
          >
            {email ? email[0]?.toUpperCase() : '·'}
          </span>
          <span className="hidden md:inline">{email ?? 'user'}</span>
        </button>
        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="close-menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-30"
            />
            <div
              data-testid="topbar-user-menu"
              role="menu"
              className="absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-border bg-bg-panel py-1 shadow-xl"
            >
              <div className="px-3 py-2 text-meta text-fg-dim">{email ?? 'sesión activa'}</div>
              <a
                href="/login.html"
                role="menuitem"
                className="block px-3 py-2 text-meta text-fg-muted hover:bg-bg-elev hover:text-fg"
              >
                Ir a login
              </a>
              <button
                type="button"
                role="menuitem"
                data-testid="topbar-logout"
                onClick={handleLogout}
                className="block w-full px-3 py-2 text-left text-meta text-critical hover:bg-bg-elev"
              >
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
