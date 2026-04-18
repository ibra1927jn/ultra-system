import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
};

// Layout estándar de página de sección. Header (title + opcional subtitle/actions)
// + slot principal. No conoce datos: sólo composición.
export function SectionShell({ title, subtitle, actions, children, testId }: Props) {
  return (
    <div data-testid={testId} className="mx-auto max-w-7xl p-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-section">{title}</h1>
          {subtitle && <p className="mt-1 text-fg-muted text-meta">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <main>{children}</main>
    </div>
  );
}
