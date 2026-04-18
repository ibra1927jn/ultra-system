type Props = {
  message: string;
  onRetry?: () => void;
  testId?: string;
};

export function ErrorState({ message, onRetry, testId = 'error-state' }: Props) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className="flex items-center justify-between gap-4 rounded-lg border border-critical/40 bg-bg-panel p-4"
    >
      <p className="text-meta text-critical">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border px-3 py-1 text-meta text-fg hover:border-accent hover:text-accent"
        >
          reintentar
        </button>
      )}
    </div>
  );
}
