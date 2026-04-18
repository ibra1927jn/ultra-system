type Props = {
  rows?: number;
  variant?: 'list' | 'card';
  testId?: string;
};

// Skeleton sin animación pesada (suficiente para feedback inmediato).
export function LoadingState({ rows = 3, variant = 'list', testId = 'loading-state' }: Props) {
  if (variant === 'card') {
    return (
      <div
        data-testid={testId}
        aria-busy="true"
        className="rounded-lg border border-border bg-bg-panel p-6"
      >
        <div className="h-3 w-24 rounded bg-bg-elev" />
        <div className="mt-4 h-9 w-40 rounded bg-bg-elev" />
      </div>
    );
  }
  return (
    <div data-testid={testId} aria-busy="true" className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2">
          <div className="h-8 w-8 rounded bg-bg-elev" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-bg-elev" />
            <div className="h-2 w-1/3 rounded bg-bg-elev" />
          </div>
        </div>
      ))}
    </div>
  );
}
