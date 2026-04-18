import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MovesOverview } from '@/sections/moves/MovesOverview';

type FetchHandler = (url: string) => Response;

function mockFetch(handler: FetchHandler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      return handler(url);
    }),
  );
}

const next48Body = {
  ok: true,
  count: 2,
  summary: { critical: 1, urgent: 1, upcoming: 0 },
  data: [
    {
      id: 1,
      type: 'flight',
      title: 'Vuelo a Madrid',
      date: new Date(Date.now() + 3600_000).toISOString(),
      location: 'AKL',
      cost: null,
      notes: null,
      urgency: 'critical',
      days_until: 0,
    },
    {
      id: 2,
      type: 'visa',
      title: 'Renovación visa',
      date: new Date(Date.now() + 36 * 3600_000).toISOString(),
      location: 'online',
      cost: null,
      notes: null,
      urgency: 'urgent',
      days_until: 1,
    },
  ],
};

const membershipsBody = {
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
    {
      id: 2,
      platform: 'POOL',
      annual_cost: 10,
      currency: 'NZD',
      renews_at: '2027-04-01',
      last_paid_at: '2026-04-01',
      auto_renew: false,
      notes: null,
      is_active: true,
      days_to_renewal: 348,
    },
    {
      id: 3,
      platform: 'OLD',
      annual_cost: 0,
      currency: 'NZD',
      renews_at: null,
      last_paid_at: null,
      auto_renew: null,
      notes: null,
      is_active: false,
      days_to_renewal: null,
    },
  ],
};

beforeEach(() => {
  mockFetch((url) => {
    if (url.includes('/api/logistics/next48h')) {
      return new Response(JSON.stringify(next48Body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/logistics/memberships')) {
      return new Response(JSON.stringify(membershipsBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MovesOverview', () => {
  it('renders 4 KPI blocks', async () => {
    render(<MovesOverview />);
    await waitFor(() => expect(screen.getByTestId('moves-kpi-48h')).toBeInTheDocument());
    expect(screen.getByTestId('moves-kpi-critical')).toBeInTheDocument();
    expect(screen.getByTestId('moves-kpi-memberships')).toBeInTheDocument();
    expect(screen.getByTestId('moves-kpi-renewals')).toBeInTheDocument();
  });

  it('next48 KPI = 2 and critical KPI = 1', async () => {
    render(<MovesOverview />);
    const kpi48 = await screen.findByTestId('moves-kpi-48h');
    const kpiCrit = await screen.findByTestId('moves-kpi-critical');
    await waitFor(() => expect(kpi48).toHaveTextContent('2'));
    expect(kpiCrit).toHaveTextContent('1');
  });

  it('active memberships = 2 (excluye is_active:false)', async () => {
    render(<MovesOverview />);
    const kpi = await screen.findByTestId('moves-kpi-memberships');
    await waitFor(() => expect(kpi).toHaveTextContent('2'));
  });

  it('renewing soon = 1 (solo miembros con days_to_renewal <=60)', async () => {
    render(<MovesOverview />);
    const kpi = await screen.findByTestId('moves-kpi-renewals');
    await waitFor(() => expect(kpi).toHaveTextContent('1'));
  });

  it('renderiza sub-sección next-48 con los items', async () => {
    render(<MovesOverview />);
    await waitFor(() => expect(screen.getByTestId('moves-48-1')).toBeInTheDocument());
    expect(screen.getByTestId('moves-48-2')).toBeInTheDocument();
    expect(screen.getByText('Vuelo a Madrid')).toBeInTheDocument();
  });
});
