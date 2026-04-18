import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback?: (err: Error, reset: () => void) => ReactNode;
};

type State = { error: Error | null };

// Error boundary mínimo: captura errores de render de sus hijos y muestra
// un fallback en vez de dejar el árbol entero blank. Sólo captura errores
// sincronous de render; errores async en hooks/eventos caen en el catch
// del propio hook.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof window !== 'undefined' && 'console' in window) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;
    if (!error) return children;

    if (fallback) return fallback(error, this.reset);

    return (
      <div
        data-testid="error-boundary-fallback"
        role="alert"
        className="mx-auto mt-8 max-w-2xl space-y-3 rounded-lg border border-critical/40 bg-bg-panel p-6"
      >
        <h2 className="text-card-title text-critical">Algo rompió esta sección</h2>
        <pre className="overflow-x-auto rounded bg-bg-base p-3 text-meta text-fg-muted">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="rounded border border-border px-3 py-1 text-meta text-fg hover:border-accent"
          >
            reintentar
          </button>
          <a
            href="/app"
            className="rounded border border-border px-3 py-1 text-meta text-fg-muted hover:border-accent hover:text-fg"
          >
            volver a home
          </a>
        </div>
      </div>
    );
  }
}
