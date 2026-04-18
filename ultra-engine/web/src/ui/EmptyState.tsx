import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  testId?: string;
};

export function EmptyState({ title, description, icon, testId = 'empty-state' }: Props) {
  return (
    <div
      data-testid={testId}
      role="status"
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-bg-panel p-10 text-center"
    >
      {icon && <div aria-hidden className="mb-3 text-fg-dim">{icon}</div>}
      <p className="text-card-title text-fg-muted">{title}</p>
      {description && <p className="mt-1 text-meta text-fg-dim">{description}</p>}
    </div>
  );
}
