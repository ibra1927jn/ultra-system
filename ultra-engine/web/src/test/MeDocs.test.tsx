import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MeDocs } from '@/sections/me/MeDocs';

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
      id: 10,
      document_name: 'NZ Passport',
      document_type: 'passport',
      expiry_date: '2030-05-15',
      alert_days: 90,
      notes: null,
      is_active: true,
      days_remaining: 1400,
      created_at: null,
      updated_at: null,
    },
    {
      id: 11,
      document_name: 'Work Visa',
      document_type: 'visa',
      expiry_date: '2025-12-01',
      alert_days: 30,
      notes: null,
      is_active: true,
      days_remaining: -10,
      created_at: null,
      updated_at: null,
    },
  ],
};

const vaccBody = {
  ok: true,
  data: [
    {
      id: 1,
      vaccine: 'Yellow Fever',
      dose_number: 1,
      date_given: '2020-01-01',
      location: null,
      country: 'AR',
      batch_number: null,
      expiry_date: null,
      certificate_url: null,
      paperless_id: null,
      notes: null,
      days_remaining: 365,
    },
  ],
};

const taxBody = {
  ok: true,
  data: [
    {
      id: 5,
      country: 'ES',
      name: 'Modelo 720',
      description: null,
      deadline: '2026-03-31',
      recurring: true,
      recurrence_rule: null,
      alert_days_array: [30, 7],
      is_active: true,
      notes: null,
      days_remaining: 20,
    },
  ],
};

beforeEach(() => {
  mockFetch((url) => {
    if (url.includes('/api/documents')) {
      return new Response(JSON.stringify(docsBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/bureaucracy/vaccinations')) {
      return new Response(JSON.stringify(vaccBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/bureaucracy/tax-deadlines')) {
      return new Response(JSON.stringify(taxBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MeDocs', () => {
  it('renders documents + vaccinations + tax lists', async () => {
    render(<MeDocs />);
    await waitFor(() => expect(screen.getByTestId('me-docs-list')).toBeInTheDocument());
    expect(screen.getByTestId('me-vacc-list')).toBeInTheDocument();
    expect(screen.getByTestId('me-tax-list')).toBeInTheDocument();
  });

  it('document with days_remaining < 0 shows vencido label', async () => {
    render(<MeDocs />);
    await waitFor(() => expect(screen.getByText(/-10d \(vencido\)/)).toBeInTheDocument());
  });

  it('document with positive days shows T-Nd', async () => {
    render(<MeDocs />);
    await waitFor(() => expect(screen.getByText('T-1400d')).toBeInTheDocument());
  });

  it('vaccine row shows dose number suffix', async () => {
    render(<MeDocs />);
    await waitFor(() => expect(screen.getByText('Yellow Fever · dosis 1')).toBeInTheDocument());
  });

  it('tax deadline renders with country subtitle', async () => {
    render(<MeDocs />);
    await waitFor(() => expect(screen.getByTestId('me-tax-5')).toBeInTheDocument());
    expect(screen.getByText('Modelo 720')).toBeInTheDocument();
  });
});
