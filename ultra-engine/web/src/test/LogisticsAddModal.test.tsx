import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogisticsAddModal } from '@/sections/moves/LogisticsAddModal';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, data: { id: 1 } }), { status: 201 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LogisticsAddModal', () => {
  it('does not render when closed', () => {
    render(<LogisticsAddModal open={false} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.queryByTestId('logistics-add-drawer')).not.toBeInTheDocument();
  });

  it('defaults type=transport and status=pending', () => {
    render(<LogisticsAddModal open={true} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByTestId('log-type-transport')).toHaveClass(/border-accent/);
    expect(screen.getByTestId('log-status-pending')).toHaveClass(/border-accent/);
  });

  it('rejects submit without title', async () => {
    render(<LogisticsAddModal open={true} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.click(screen.getByTestId('logistics-add-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Título/));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts with all fields and calls onCreated', async () => {
    const onCreated = vi.fn();
    render(<LogisticsAddModal open={true} onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByTestId('log-title'), {
      target: { value: 'Vuelo AKL → MEL' },
    });
    fireEvent.change(screen.getByTestId('log-date'), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByTestId('log-cost'), { target: { value: '420' } });
    fireEvent.change(screen.getByTestId('log-location'), {
      target: { value: 'Auckland → Melbourne' },
    });
    fireEvent.click(screen.getByTestId('log-type-visa'));
    fireEvent.click(screen.getByTestId('log-status-confirmed'));
    fireEvent.click(screen.getByTestId('logistics-add-submit'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      type: 'visa',
      title: 'Vuelo AKL → MEL',
      date: '2026-05-01',
      location: 'Auckland → Melbourne',
      status: 'confirmed',
      cost: 420,
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('shows backend error message', async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'bad type' }), { status: 400 }),
    );
    render(<LogisticsAddModal open={true} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByTestId('log-title'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('logistics-add-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/bad type/));
  });
});
