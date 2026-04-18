import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MovesPoi } from '@/sections/moves/MovesPoi';

type FetchHandler = (url: string) => Response | Promise<Response>;

function mockFetch(handler: FetchHandler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      return handler(url);
    }),
  );
}

const samplePois = {
  ok: true,
  count: 2,
  fetched: 2,
  data: [
    {
      id: 1,
      name: 'Free Park',
      latitude: -36.85,
      longitude: 174.76,
      poi_type: 'campsite',
      source: 'osm',
      has_water: true,
      has_dump: false,
      has_shower: false,
      has_wifi: false,
      has_power: false,
      is_free: true,
      tags: null,
      notes: null,
    },
    {
      id: 2,
      name: 'Paid Motel',
      latitude: -36.86,
      longitude: 174.77,
      poi_type: 'campsite',
      source: 'osm',
      has_water: true,
      has_dump: true,
      has_shower: true,
      has_wifi: true,
      has_power: true,
      is_free: false,
      tags: null,
      notes: null,
    },
  ],
};

const originalGeolocation = navigator.geolocation;

beforeEach(() => {
  // Silence geolocation auto-trigger in tests — we drive through presets.
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: undefined,
  });
  mockFetch(() =>
    new Response(JSON.stringify(samplePois), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: originalGeolocation,
  });
});

describe('MovesPoi', () => {
  it('shows empty-state prompt when no coords selected', () => {
    render(<MovesPoi />);
    expect(screen.getByText(/Elige una ubicación preset/i)).toBeInTheDocument();
  });

  it('preset button triggers fetch and renders poi list', async () => {
    render(<MovesPoi />);
    fireEvent.click(screen.getByTestId('poi-preset-Auckland'));

    await waitFor(() => expect(screen.getByTestId('poi-list')).toBeInTheDocument());
    expect(screen.getByTestId('poi-1')).toBeInTheDocument();
    expect(screen.getByTestId('poi-2')).toBeInTheDocument();
    expect(screen.getByTestId('poi-coords')).toHaveTextContent('fuente preset');
  });

  it('filter "sólo gratis" hides non-free POIs', async () => {
    render(<MovesPoi />);
    fireEvent.click(screen.getByTestId('poi-preset-Auckland'));
    await waitFor(() => expect(screen.getByTestId('poi-list')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('poi-free-only'));

    expect(screen.getByTestId('poi-1')).toBeInTheDocument();
    expect(screen.queryByTestId('poi-2')).toBeNull();
  });

  it('renders badges based on has_* flags', async () => {
    render(<MovesPoi />);
    fireEvent.click(screen.getByTestId('poi-preset-Auckland'));
    await waitFor(() => expect(screen.getByTestId('poi-1')).toBeInTheDocument());

    const row = screen.getByTestId('poi-2');
    expect(row).toHaveTextContent('agua');
    expect(row).toHaveTextContent('dump');
    expect(row).toHaveTextContent('ducha');
    expect(row).toHaveTextContent('wifi');
    expect(row).toHaveTextContent('luz');
  });
});
