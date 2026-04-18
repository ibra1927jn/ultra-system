import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MeTimeline } from '@/sections/me/MeTimeline';

function mockFetch(map: Array<[string, unknown]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      for (const [k, v] of map) {
        if (url.includes(k)) {
          return new Response(JSON.stringify(v), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

const docsBody = {
  ok: true,
  data: [
    {
      id: 1, document_name: 'Pasaporte ES', document_type: 'passport',
      expiry_date: '2026-05-10', alert_days: 90, notes: null, is_active: true,
      days_remaining: 22, created_at: null, updated_at: null,
    },
    {
      id: 2, document_name: 'Visa WHV NZ', document_type: 'visa',
      expiry_date: '2026-04-25', alert_days: 60, notes: null, is_active: true,
      days_remaining: 7, created_at: null, updated_at: null,
    },
  ],
};

const taxBody = {
  ok: true,
  data: [
    {
      id: 10, country: 'ES', name: 'IRPF Modelo 100',
      description: null, deadline: '2026-06-30', recurring: true, recurrence_rule: 'YEARLY',
      alert_days_array: [60, 30], is_active: true, notes: null, days_remaining: 73,
    },
    {
      id: 11, country: 'NZ', name: 'PAYE March', description: null,
      deadline: '2026-03-31', recurring: true, recurrence_rule: 'MONTHLY',
      alert_days_array: [14], is_active: true, notes: null, days_remaining: -18,
    },
  ],
};

const vaccBody = {
  ok: true,
  data: [
    {
      id: 1, vaccine: 'Hepatitis A', dose_number: 2, date_given: '2024-05-14',
      location: 'Auckland', country: 'NZ', batch_number: null,
      expiry_date: '2026-05-19', certificate_url: null, paperless_id: null,
      notes: null, days_remaining: 31,
    },
  ],
};

const memBody = {
  ok: true,
  data: [
    {
      id: 1, platform: 'Workaway', annual_cost: '49.00', currency: 'USD',
      renews_at: '2027-01-14', last_paid_at: null, auto_renew: false,
      notes: null, is_active: true, days_to_renewal: 272,
    },
  ],
};

beforeEach(() => {
  mockFetch([
    ['/api/documents', docsBody],
    ['/api/bureaucracy/tax-deadlines', taxBody],
    ['/api/bureaucracy/vaccinations', vaccBody],
    ['/api/logistics/memberships', memBody],
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderTimeline() {
  return render(
    <MemoryRouter>
      <MeTimeline />
    </MemoryRouter>,
  );
}

describe('MeTimeline', () => {
  it('renders overdue + this-month + quarter + later buckets', async () => {
    renderTimeline();
    await waitFor(() => expect(screen.getByTestId('timeline-event-doc-2')).toBeInTheDocument());
    expect(screen.getByTestId('timeline-bucket-overdue')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-bucket-this-month')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-bucket-quarter')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-bucket-later')).toBeInTheDocument();
  });

  it('sorts events within a bucket by daysRemaining', async () => {
    renderTimeline();
    await waitFor(() => expect(screen.getByTestId('timeline-event-doc-2')).toBeInTheDocument());
    // this-month bucket contains doc-2 (7d) and doc-1 (22d) and vacc-1 (31d)? vacc 31 is this-month too (≤30 actually no, 31>30 → quarter)
    // Actually my threshold for this-month is <=30, so vacc-1 (31) goes to quarter. doc-2(7), doc-1(22) in this-month.
    const bucket = screen.getByTestId('timeline-bucket-this-month');
    const events = bucket.querySelectorAll('[data-testid^="timeline-event-"]');
    expect(events.length).toBe(2);
    expect((events[0] as HTMLElement).getAttribute('data-testid')).toContain('doc-2');
    expect((events[1] as HTMLElement).getAttribute('data-testid')).toContain('doc-1');
  });

  it('filter button shows only selected source', async () => {
    renderTimeline();
    await waitFor(() => expect(screen.getByTestId('timeline-event-doc-2')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('timeline-filter-tax'));
    expect(screen.getByTestId('timeline-event-tax-10')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-event-tax-11')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-event-doc-1')).not.toBeInTheDocument();
  });

  it('shows empty state if no events match filter', async () => {
    mockFetch([
      ['/api/documents', { ok: true, data: [] }],
      ['/api/bureaucracy/tax-deadlines', { ok: true, data: [] }],
      ['/api/bureaucracy/vaccinations', { ok: true, data: [] }],
      ['/api/logistics/memberships', { ok: true, data: [] }],
    ]);
    renderTimeline();
    await waitFor(() => expect(screen.getByText(/Sin eventos/)).toBeInTheDocument());
  });
});
