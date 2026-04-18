import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MovesMemberships } from '@/sections/moves/MovesMemberships';

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MovesMemberships', () => {
  it('empty state when data is []', async () => {
    mockFetch({ ok: true, data: [] });
    render(<MovesMemberships />);
    await waitFor(() =>
      expect(screen.getByText(/sin membresías|no hay membresías/i)).toBeInTheDocument(),
    );
  });

  it('renders membership rows', async () => {
    mockFetch({
      ok: true,
      data: [
        {
          id: 1,
          platform: 'DOC',
          annual_cost: 50,
          currency: 'NZD',
          renews_at: '2026-06-01',
          last_paid_at: '2025-06-01',
          auto_renew: true,
          notes: null,
          is_active: true,
          days_to_renewal: 45,
        },
      ],
    });
    render(<MovesMemberships />);

    await waitFor(() => expect(screen.getByTestId('moves-mem-1')).toBeInTheDocument());
    expect(screen.getByText('DOC')).toBeInTheDocument();
    expect(screen.getByText(/50 NZD\/yr · auto-renew/i)).toBeInTheDocument();
    expect(screen.getByText('T-45d')).toBeInTheDocument();
  });

  it('shows vencido label when days_to_renewal < 0', async () => {
    mockFetch({
      ok: true,
      data: [
        {
          id: 2,
          platform: 'OLD',
          annual_cost: null,
          currency: null,
          renews_at: null,
          last_paid_at: null,
          auto_renew: false,
          notes: null,
          is_active: true,
          days_to_renewal: -5,
        },
      ],
    });
    render(<MovesMemberships />);
    await waitFor(() => expect(screen.getByText('-5d (vencido)')).toBeInTheDocument());
  });

  it('error state on HTTP 500', async () => {
    mockFetch({ error: 'nope' }, 500);
    render(<MovesMemberships />);
    await waitFor(() =>
      expect(document.querySelector('[role="alert"], .text-critical, .text-attention, .bg-critical')).toBeTruthy(),
    );
  });
});
