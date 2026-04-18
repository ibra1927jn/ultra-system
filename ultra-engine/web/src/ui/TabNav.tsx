import { NavLink } from 'react-router-dom';

type Tab = { to: string; label: string; testId?: string };

type Props = {
  tabs: ReadonlyArray<Tab>;
  testId?: string;
};

// Nav horizontal de sub-tabs con estado URL-driven (NavLink).
// `end` en los links evita que "overview" quede activo cuando estamos en "/matches".
export function TabNav({ tabs, testId }: Props) {
  return (
    <nav
      data-testid={testId}
      aria-label="sub-sections"
      className="flex gap-1 border-b border-border"
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          data-testid={t.testId}
          className={({ isActive }) =>
            [
              'px-4 py-2 text-card-title transition',
              isActive
                ? 'border-b-2 border-accent text-fg'
                : 'border-b-2 border-transparent text-fg-muted hover:text-fg',
            ].join(' ')
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
