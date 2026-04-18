import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/ui/ErrorBoundary';

// Silencia el console.error que React loggea ante un throw en render.
let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleSpy.mockRestore();
});

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom test');
  return <span data-testid="ok-content">ok</span>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('ok-content')).toBeInTheDocument();
  });

  it('renders fallback with error message when child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText(/boom test/)).toBeInTheDocument();
  });

  it('reset button clears the error', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText(/reintentar/));
    expect(screen.getByTestId('ok-content')).toBeInTheDocument();
  });

  it('uses custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={(err) => <span data-testid="custom">OOPS: {err.message}</span>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('custom')).toHaveTextContent('OOPS: boom test');
  });
});
