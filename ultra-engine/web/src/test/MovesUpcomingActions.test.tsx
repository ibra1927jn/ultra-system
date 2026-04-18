import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MovesUpcoming } from '@/sections/moves/MovesUpcoming';

let fetchMock: ReturnType<typeof vi.fn>;

const upcomingBody = {
  ok: true,
  data: [
    {
      id: 6,
      type: 'transport',
      title: 'Vuelo AKL → MEL',
      date: '2026-05-01',
      location: 'Auckland → Melbourne',
      cost: '420',
      notes: null,
      status: 'pending',
      days_until: 13,
    },
    {
      id: 7,
      type: 'visa',
      title: 'Cita embajada',
      date: '2026-05-10',
      location: 'Wellington',
      cost: null,
      notes: null,
      status: 'confirmed',
      days_until: 22,
    },
  ],
  window_days: 90,
};

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/logistics/upcoming')) {
      return new Response(JSON.stringify(upcomingBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.match(/\/api\/logistics\/\d+$/) && init?.method === 'PATCH') {
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderUpcoming() {
  return render(
    <MemoryRouter>
      <MovesUpcoming />
    </MemoryRouter>,
  );
}

describe('MovesUpcoming actions', () => {
  it('renders 2 items from fixture', async () => {
    renderUpcoming();
    await waitFor(() => expect(screen.getByTestId('moves-up-6')).toBeInTheDocument());
    expect(screen.getByTestId('moves-up-7')).toBeInTheDocument();
    expect(screen.getByText(/Vuelo AKL/)).toBeInTheDocument();
  });

  it('pending item shows confirm + done buttons', async () => {
    renderUpcoming();
    await waitFor(() => expect(screen.getByTestId('moves-up-6-confirm')).toBeInTheDocument());
    expect(screen.getByTestId('moves-up-6-done')).toBeInTheDocument();
  });

  it('confirmed item hides confirm button', async () => {
    renderUpcoming();
    await waitFor(() => expect(screen.getByTestId('moves-up-7-done')).toBeInTheDocument());
    expect(screen.queryByTestId('moves-up-7-confirm')).not.toBeInTheDocument();
  });

  it('clicking done PATCHes status=done', async () => {
    renderUpcoming();
    await waitFor(() => expect(screen.getByTestId('moves-up-6-done')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('moves-up-6-done'));
    await waitFor(() => {
      const patches = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patches.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse((patches[0]![1] as RequestInit).body as string);
      expect(body).toEqual({ status: 'done' });
    });
  });

  it('clicking confirmar PATCHes status=confirmed', async () => {
    renderUpcoming();
    await waitFor(() => expect(screen.getByTestId('moves-up-6-confirm')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('moves-up-6-confirm'));
    await waitFor(() => {
      const patches = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      const confirmPatch = patches.find((c) => {
        const body = JSON.parse((c[1] as RequestInit).body as string);
        return body.status === 'confirmed';
      });
      expect(confirmPatch).toBeDefined();
    });
  });
});
