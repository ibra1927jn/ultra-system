import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpenseAddModal } from '@/sections/money/ExpenseAddModal';

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

describe('ExpenseAddModal', () => {
  it('does not render when closed', () => {
    render(<ExpenseAddModal open={false} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.queryByTestId('expense-add-drawer')).not.toBeInTheDocument();
  });

  it('defaults to expense type + NZD', () => {
    render(<ExpenseAddModal open={true} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByTestId('expense-type-expense')).toHaveClass(/border-accent/);
    expect((screen.getByTestId('expense-currency') as HTMLSelectElement).value).toBe('NZD');
  });

  it('rejects submit with 0 amount', async () => {
    render(<ExpenseAddModal open={true} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.click(screen.getByTestId('expense-add-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Amount/));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('switching type updates category options', () => {
    render(<ExpenseAddModal open={true} onClose={() => {}} onCreated={() => {}} />);
    // Default expense: category = groceries
    expect((screen.getByTestId('expense-category') as HTMLSelectElement).value).toBe(
      'groceries',
    );
    fireEvent.click(screen.getByTestId('expense-type-income'));
    // After switch, category resets to salary
    expect((screen.getByTestId('expense-category') as HTMLSelectElement).value).toBe(
      'salary',
    );
  });

  it('posts complete payload and calls onCreated', async () => {
    const onCreated = vi.fn();
    render(<ExpenseAddModal open={true} onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByTestId('expense-amount'), { target: { value: '25.50' } });
    fireEvent.change(screen.getByTestId('expense-category'), { target: { value: 'fuel' } });
    fireEvent.change(screen.getByTestId('expense-description'), {
      target: { value: 'gasolina Z' },
    });
    fireEvent.change(screen.getByTestId('expense-account'), { target: { value: 'Wise NZD' } });
    fireEvent.click(screen.getByTestId('expense-add-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      type: 'expense',
      amount: 25.5,
      category: 'fuel',
      description: 'gasolina Z',
      currency: 'NZD',
      account: 'Wise NZD',
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('shows backend error on HTTP 400', async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'category invalid' }), {
          status: 400,
        }),
    );
    render(<ExpenseAddModal open={true} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByTestId('expense-amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('expense-add-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/category invalid/));
  });
});
