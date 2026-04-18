import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogisticsEditModal } from '@/sections/moves/LogisticsEditModal';
import type { LogisticsItem } from '@/sections/moves/types';

let fetchMock: ReturnType<typeof vi.fn>;

const baseItem: LogisticsItem = {
  id: 42,
  type: 'transport',
  title: 'Vuelo AKL → MEL',
  date: '2026-05-01',
  location: 'Auckland → Melbourne',
  cost: '420',
  notes: 'nota original',
  status: 'pending',
  days_until: 13,
};

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LogisticsEditModal', () => {
  it('no render cuando item=null', () => {
    render(<LogisticsEditModal item={null} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByTestId('logistics-edit-drawer')).not.toBeInTheDocument();
  });

  it('pre-fills desde el item prop', async () => {
    render(<LogisticsEditModal item={baseItem} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() =>
      expect((screen.getByTestId('edit-title') as HTMLInputElement).value).toBe(
        'Vuelo AKL → MEL',
      ),
    );
    expect((screen.getByTestId('edit-date') as HTMLInputElement).value).toBe('2026-05-01');
    expect((screen.getByTestId('edit-cost') as HTMLInputElement).value).toBe('420');
    expect(screen.getByTestId('edit-type-transport')).toHaveClass(/border-accent/);
    expect(screen.getByTestId('edit-status-pending')).toHaveClass(/border-accent/);
  });

  it('title requerido — no POST si vacío', async () => {
    render(<LogisticsEditModal item={baseItem} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('edit-title')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('edit-title'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('logistics-edit-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Título/));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('PATCH con los nuevos valores', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<LogisticsEditModal item={baseItem} onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByTestId('edit-title')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('edit-title'), {
      target: { value: 'Vuelo modificado' },
    });
    fireEvent.click(screen.getByTestId('edit-type-visa'));
    fireEvent.click(screen.getByTestId('edit-status-confirmed'));
    fireEvent.click(screen.getByTestId('logistics-edit-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0]!;
    expect(String(call[0])).toContain('/api/logistics/42');
    expect((call[1] as RequestInit).method).toBe('PATCH');
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      type: 'visa',
      title: 'Vuelo modificado',
      status: 'confirmed',
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('error backend se muestra con role=alert', async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ ok: false, error: 'invalid type' }), { status: 400 }),
    );
    render(<LogisticsEditModal item={baseItem} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('edit-title')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('logistics-edit-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid type/));
  });
});
