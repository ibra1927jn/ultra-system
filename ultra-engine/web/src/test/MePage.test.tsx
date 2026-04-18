import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MePage from '@/sections/me/MePage';

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

const docsBody = {
  ok: true,
  data: [
    {
      id: 1,
      document_name: 'NZ Green Warrant',
      document_type: 'vehicle_certification',
      expiry_date: '2026-06-01',
      alert_days: 60,
      notes: null,
      is_active: true,
      days_remaining: 45,
      created_at: null,
      updated_at: null,
    },
  ],
};

const taxBody = {
  ok: true,
  data: [
    {
      id: 10,
      country: 'ES',
      name: 'IRPF Modelo 100',
      description: null,
      deadline: '2026-06-30',
      recurring: true,
      recurrence_rule: 'YEARLY',
      alert_days_array: [60, 30],
      is_active: true,
      notes: null,
      days_remaining: 25,
    },
  ],
};

const vaccBody = {
  ok: true,
  data: [
    {
      id: 1,
      vaccine: 'Hepatitis A',
      dose_number: 2,
      date_given: '2024-05-14',
      location: 'Auckland CBD',
      country: 'NZ',
      batch_number: null,
      expiry_date: '2026-05-19',
      certificate_url: null,
      paperless_id: null,
      notes: null,
      days_remaining: 32,
    },
  ],
};

const schengenBody = {
  ok: true,
  data: {
    target_date: '2026-04-18',
    window_start: '2025-10-21',
    window_end: '2026-04-18',
    days_used: 0,
    days_remaining: 90,
    overstay: false,
    total_trips_logged: 0,
  },
};

const moodBody = {
  ok: true,
  count: 0,
  averages: null,
  data: [],
};

beforeEach(() => {
  mockFetch((url) => {
    const map: Array<[string, unknown]> = [
      ['/api/documents', docsBody],
      ['/api/bureaucracy/tax-deadlines', taxBody],
      ['/api/bureaucracy/vaccinations', vaccBody],
      ['/api/bureaucracy/schengen', schengenBody],
      ['/api/bio/mood', moodBody],
    ];
    for (const [k, v] of map) {
      if (url.includes(k)) {
        return new Response(JSON.stringify(v), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
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
        <Route path="/app/me/*" element={<MePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MePage', () => {
  it('overview renders 5 KPIs', async () => {
    renderAt('/app/me');
    await waitFor(() => expect(screen.getByTestId('me-kpi-docs')).toBeInTheDocument());
    expect(screen.getByTestId('me-kpi-vacc')).toBeInTheDocument();
    expect(screen.getByTestId('me-kpi-tax')).toBeInTheDocument();
    expect(screen.getByTestId('me-kpi-schengen')).toBeInTheDocument();
    expect(screen.getByTestId('me-kpi-mood')).toBeInTheDocument();
  });

  it('docs tab renders doc + vacc + tax sections', async () => {
    renderAt('/app/me/docs');
    await waitFor(() => expect(screen.getByTestId('me-docs-list')).toBeInTheDocument());
    expect(screen.getByTestId('me-vacc-list')).toBeInTheDocument();
    expect(screen.getByTestId('me-tax-list')).toBeInTheDocument();
    expect(screen.getByText(/NZ Green Warrant/)).toBeInTheDocument();
    expect(screen.getByText(/Hepatitis A/)).toBeInTheDocument();
    expect(screen.getByText(/IRPF Modelo 100/)).toBeInTheDocument();
  });

  it('bio tab shows Schengen KPI + empty mood', async () => {
    renderAt('/app/me/bio');
    await waitFor(() => expect(screen.getByTestId('me-bio-schengen-used')).toBeInTheDocument());
    expect(screen.getByText(/No hay registros de mood/)).toBeInTheDocument();
  });

  it('tab nav shows all 3 tabs', async () => {
    renderAt('/app/me');
    expect(screen.getByTestId('me-tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('me-tab-docs')).toBeInTheDocument();
    expect(screen.getByTestId('me-tab-bio')).toBeInTheDocument();
  });
});
