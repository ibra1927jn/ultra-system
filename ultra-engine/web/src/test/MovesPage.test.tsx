import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MovesPage from '@/sections/moves/MovesPage';

function mockFetch(handler: (url: string) => Response) {
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
  count: 0,
  summary: { critical: 0, urgent: 0, upcoming: 0 },
  data: [],
};

const membershipsBody = {
  ok: true,
  data: [
    {
      id: 1,
      platform: 'Workaway',
      annual_cost: '49.00',
      currency: 'USD',
      renews_at: '2027-01-14',
      last_paid_at: null,
      auto_renew: false,
      notes: null,
      is_active: true,
      days_to_renewal: 272,
    },
  ],
};

const upcomingBody = { ok: true, data: [] };

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
    if (url.includes('/api/logistics/upcoming')) {
      return new Response(JSON.stringify(upcomingBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/moves/*" element={<MovesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MovesPage', () => {
  it('overview renders 4 KPIs', async () => {
    renderAt('/app/moves');
    await waitFor(() => expect(screen.getByTestId('moves-kpi-48h')).toBeInTheDocument());
    expect(screen.getByTestId('moves-kpi-critical')).toBeInTheDocument();
    expect(screen.getByTestId('moves-kpi-memberships')).toBeInTheDocument();
    expect(screen.getByTestId('moves-kpi-renewals')).toBeInTheDocument();
  });

  it('memberships tab renders list', async () => {
    renderAt('/app/moves/memberships');
    await waitFor(() => expect(screen.getByTestId('moves-memberships-list')).toBeInTheDocument());
    expect(screen.getByText('Workaway')).toBeInTheDocument();
  });

  it('upcoming tab shows empty state when list is empty', async () => {
    renderAt('/app/moves/upcoming');
    await waitFor(() => expect(screen.getByText(/Sin movimientos planeados/)).toBeInTheDocument());
  });

  it('tab nav shows all 3 tabs', async () => {
    renderAt('/app/moves');
    expect(screen.getByTestId('moves-tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('moves-tab-upcoming')).toBeInTheDocument();
    expect(screen.getByTestId('moves-tab-memberships')).toBeInTheDocument();
  });
});
