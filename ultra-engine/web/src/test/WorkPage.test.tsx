import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WorkPage from '@/sections/work/WorkPage';

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: FetchHandler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      return handler(url, init);
    }),
  );
}

const pipelineBody = {
  ok: true,
  data: {
    total: 12,
    by_status: [
      { status: 'new', count: 10 },
      { status: 'contacted', count: 1 },
      { status: 'applied', count: 1 },
    ],
    conversion_rates: {
      new_to_contacted: 17,
      contacted_to_applied: 50,
      applied_to_won: 0,
      overall_win_rate: 0,
    },
    need_follow_up: [],
    upcoming_deadlines: [],
  },
};

const oppListBody = {
  ok: true,
  data: [
    {
      id: 42,
      title: 'Remote Rust engineer',
      source: 'remoteok',
      url: 'https://example.com/r/42',
      category: 'remote',
      status: 'new',
      match_score: 14,
      description: 'Ship core rust services',
      payout_type: 'salaried',
      salary_min: 120000,
      salary_max: 160000,
      currency: 'USD',
      tags: ['rust'],
      language_req: [],
      deadline: null,
      posted_at: '2026-04-17T10:00:00Z',
      last_seen: '2026-04-18T00:00:00Z',
      created_at: '2026-04-17T10:00:00Z',
    },
  ],
  count: 1,
};

beforeEach(() => {
  mockFetch((url) => {
    if (url.includes('/api/opportunities/pipeline')) {
      return new Response(JSON.stringify(pipelineBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/opportunities/high-score') || url.includes('/api/opportunities')) {
      return new Response(JSON.stringify(oppListBody), {
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
        <Route path="/app/work/*" element={<WorkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkPage', () => {
  it('overview tab renders KPIs and featured list', async () => {
    renderAt('/app/work');
    await waitFor(() =>
      expect(screen.getByTestId('work-kpi-high')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('work-kpi-new')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Remote Rust engineer')).toBeInTheDocument(),
    );
  });

  it('matches tab renders filter bar and list', async () => {
    renderAt('/app/work/matches');
    expect(screen.getByTestId('work-filter-q')).toBeInTheDocument();
    expect(screen.getByTestId('work-filter-score')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('work-matches-list')).toBeInTheDocument(),
    );
  });

  it('pipeline tab renders kanban with 5 columns', async () => {
    renderAt('/app/work/pipeline');
    await waitFor(() =>
      expect(screen.getByTestId('work-pipeline-kanban')).toBeInTheDocument(),
    );
    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    expect(screen.getByText('Contactado')).toBeInTheDocument();
    expect(screen.getByText('Aplicado')).toBeInTheDocument();
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
    expect(screen.getByText('Ganado')).toBeInTheDocument();
  });

  it('tab nav shows all 3 tabs', async () => {
    renderAt('/app/work');
    expect(screen.getByTestId('work-tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('work-tab-matches')).toBeInTheDocument();
    expect(screen.getByTestId('work-tab-pipeline')).toBeInTheDocument();
  });
});
