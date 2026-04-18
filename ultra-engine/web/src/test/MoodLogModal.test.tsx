import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MoodLogModal } from '@/sections/me/MoodLogModal';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, data: { id: 1 } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MoodLogModal', () => {
  it('does not render when closed', () => {
    render(<MoodLogModal open={false} onClose={() => {}} onLogged={() => {}} />);
    expect(screen.queryByTestId('mood-log-drawer')).not.toBeInTheDocument();
  });

  it('renders three sliders at default 5 when open', () => {
    render(<MoodLogModal open={true} onClose={() => {}} onLogged={() => {}} />);
    expect(screen.getByTestId('mood-slider-value')).toHaveTextContent('5/10');
    expect(screen.getByTestId('energy-slider-value')).toHaveTextContent('5/10');
    expect(screen.getByTestId('anxiety-slider-value')).toHaveTextContent('5/10');
  });

  it('submits the slider values + notes and calls onLogged', async () => {
    const onLogged = vi.fn();
    render(<MoodLogModal open={true} onClose={() => {}} onLogged={onLogged} />);

    fireEvent.change(screen.getByTestId('mood-slider'), { target: { value: '8' } });
    fireEvent.change(screen.getByTestId('energy-slider'), { target: { value: '7' } });
    fireEvent.change(screen.getByTestId('mood-notes'), { target: { value: 'buen día' } });
    fireEvent.click(screen.getByTestId('mood-log-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ mood: 8, energy: 7, anxiety: 5, notes: 'buen día' });
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
  });

  it('shows error on HTTP 500', async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500 }),
    );
    render(<MoodLogModal open={true} onClose={() => {}} onLogged={() => {}} />);
    fireEvent.click(screen.getByTestId('mood-log-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/HTTP 500/));
  });

  it('omits notes when empty', async () => {
    render(<MoodLogModal open={true} onClose={() => {}} onLogged={() => {}} />);
    fireEvent.click(screen.getByTestId('mood-log-submit'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.notes).toBe(null);
  });
});
