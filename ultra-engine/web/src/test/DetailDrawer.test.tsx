import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { DetailDrawer } from '@/ui/DetailDrawer';

function Harness({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="outside-trigger" onClick={() => setOpen(true)}>
        open
      </button>
      <DetailDrawer open={open} onClose={() => setOpen(false)} title="Hola">
        {children ?? (
          <>
            <button type="button" data-testid="drawer-btn-1">one</button>
            <button type="button" data-testid="drawer-btn-2">two</button>
          </>
        )}
      </DetailDrawer>
    </>
  );
}

describe('DetailDrawer focus trap', () => {
  it('focuses first focusable element on open', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('outside-trigger'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'cerrar' }));
  });

  it('sentinel end redirects focus to first focusable', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('outside-trigger'));
    const endSentinel = screen.getByTestId('drawer-focus-sentinel-end');
    endSentinel.focus();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'cerrar' }));
  });

  it('sentinel start redirects focus to last focusable', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('outside-trigger'));
    const startSentinel = screen.getByTestId('drawer-focus-sentinel-start');
    startSentinel.focus();
    expect(document.activeElement).toBe(screen.getByTestId('drawer-btn-2'));
  });

  it('restores previous focus on close', () => {
    render(<Harness />);
    const trigger = screen.getByTestId('outside-trigger');
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('ESC closes drawer', () => {
    const onClose = vi.fn();
    render(
      <DetailDrawer open onClose={onClose} title="X">
        <button type="button">child</button>
      </DetailDrawer>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
