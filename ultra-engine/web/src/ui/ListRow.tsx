import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  external?: boolean;
  testId?: string;
};

// Fila de lista genérica. Renderiza <a> si href, <button> si onClick, <div> si nada.
// external=true => target=_blank rel=noopener noreferrer.
export function ListRow({
  title, subtitle, icon, trailing, href, onClick, external, testId,
}: Props) {
  const inner = (
    <>
      {icon && <span className="shrink-0 text-fg-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-card-title">{title}</span>
        {subtitle && (
          <span className="block truncate text-meta text-fg-muted">{subtitle}</span>
        )}
      </span>
      {trailing && <span className="shrink-0 text-meta text-fg-muted">{trailing}</span>}
    </>
  );

  const cls =
    'flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left ' +
    'transition hover:border-border hover:bg-bg-elev focus:outline-none focus-visible:border-accent';

  if (href) {
    return (
      <a
        data-testid={testId}
        href={href}
        className={cls}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button data-testid={testId} type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return (
    <div data-testid={testId} className={cls}>
      {inner}
    </div>
  );
}
