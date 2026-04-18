type Badge = 'none' | 'info' | 'warn' | 'alert';

type Props = {
  kpi: string | number | null;
  label?: string;
  badge?: Badge;
  priorityScore?: number;
  testId?: string;
};

const BADGE_TEXT: Record<Badge, string> = {
  none: 'text-fg-dim',
  info: 'text-fg-muted',
  warn: 'text-attention',
  alert: 'text-critical',
};

const BADGE_DOT: Record<Badge, string> = {
  none: 'bg-fg-dim',
  info: 'bg-accent',
  warn: 'bg-attention',
  alert: 'bg-critical',
};

// KPI grande + label + dot-indicador opcional (color por badge).
// priorityScore es opt-in, sólo se renderiza si pasa por testId/aria.
export function StatBlock({ kpi, label, badge = 'none', priorityScore, testId }: Props) {
  return (
    <div
      data-testid={testId}
      data-priority={priorityScore ?? undefined}
      className="rounded-lg border border-border bg-bg-panel p-6"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className={`h-2 w-2 rounded-full ${BADGE_DOT[badge]}`} />
        <span className={`text-meta uppercase tracking-wide ${BADGE_TEXT[badge]}`}>
          {label ?? ''}
        </span>
      </div>
      <div className="mt-3 text-kpi-lg">
        {kpi !== null && kpi !== undefined ? kpi : <span className="text-fg-dim">—</span>}
      </div>
    </div>
  );
}
