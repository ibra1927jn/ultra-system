import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '@/ui/Toast';

afterEach(() => {
  vi.useRealTimers();
});

function Trigger({ variant, msg }: { variant: 'success' | 'error' | 'info'; msg: string }) {
  const toast = useToast();
  return (
    <button data-testid={`trigger-${variant}`} onClick={() => toast[variant](msg)}>
      fire
    </button>
  );
}

describe('ToastProvider', () => {
  it('renders empty stack initially', () => {
    render(
      <ToastProvider>
        <span>child</span>
      </ToastProvider>,
    );
    expect(screen.getByTestId('toast-stack')).toBeInTheDocument();
  });

  it('pushes a success toast on trigger', () => {
    render(
      <ToastProvider>
        <Trigger variant="success" msg="¡hecho!" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId('trigger-success'));
    expect(screen.getByTestId('toast-success')).toHaveTextContent('¡hecho!');
  });

  it('auto-dismisses after 3.5s', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger variant="info" msg="temporal" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-info'));
    });
    expect(screen.getByTestId('toast-info')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByTestId('toast-info')).not.toBeInTheDocument();
  });

  it('error toast uses role=alert', () => {
    render(
      <ToastProvider>
        <Trigger variant="error" msg="boom" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId('trigger-error'));
    expect(screen.getByTestId('toast-error')).toHaveAttribute('role', 'alert');
  });

  it('useToast without provider returns no-op (no throw)', () => {
    // Test directo del fallback NOOP_CTX
    const Consumer = () => {
      const toast = useToast();
      toast.success('x');
      toast.error('y');
      toast.info('z');
      return <span>ok</span>;
    };
    expect(() => render(<Consumer />)).not.toThrow();
  });
});
