import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WorldIntel } from '@/sections/world/WorldIntel';

let fetchMock: ReturnType<typeof vi.fn>;

const briefBody = {
  ok: true,
  data: {
    signal_context: 'ME + EE convergence',
    convergence_zones: [
      {
        region: 'Middle East',
        countries: ['IR', 'SA', 'IL'],
        description: 'Middle East: military air + thermal + naval across Iran, Saudi, Israel',
        signalTypes: ['military_flight', 'satellite_fire', 'military_vessel'],
        totalSignals: 225,
      },
      {
        region: 'Eastern Europe',
        countries: ['RU', 'UA'],
        description: 'EE thermal + military',
        signalTypes: ['military_flight', 'satellite_fire'],
        totalSignals: 215,
      },
    ],
    top_countries: [
      {
        country: 'XX',
        countryName: 'XX',
        totalCount: 3131,
        signalTypes: ['military_flight', 'military_vessel'],
      },
      {
        country: 'CN',
        countryName: 'China',
        totalCount: 1090,
        signalTypes: ['military_flight', 'satellite_fire'],
      },
    ],
  },
};

const emptyBody = {
  ok: true,
  data: { convergence_zones: [], top_countries: [] },
};

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(briefBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorldIntel', () => {
  it('renders convergence zones with signals count', async () => {
    render(<WorldIntel />);
    await waitFor(() =>
      expect(screen.getByTestId('intel-zone-Middle-East')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('intel-zone-Eastern-Europe')).toBeInTheDocument();
    expect(screen.getByText(/225 signals/)).toBeInTheDocument();
    expect(screen.getByText(/215 signals/)).toBeInTheDocument();
  });

  it('renders country ISO badges', async () => {
    render(<WorldIntel />);
    await waitFor(() =>
      expect(screen.getByTestId('intel-zone-Middle-East')).toBeInTheDocument(),
    );
    expect(screen.getByText('IR')).toBeInTheDocument();
    expect(screen.getByText('SA')).toBeInTheDocument();
    expect(screen.getByText('IL')).toBeInTheDocument();
  });

  it('renders top countries list', async () => {
    render(<WorldIntel />);
    await waitFor(() =>
      expect(screen.getByTestId('world-intel-countries')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('intel-country-CN')).toBeInTheDocument();
    expect(screen.getByText('China')).toBeInTheDocument();
    expect(screen.getByText('1090')).toBeInTheDocument();
  });

  it('renders nothing when both zones and countries are empty', async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify(emptyBody), { status: 200 }),
    );
    const { container } = render(<WorldIntel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Wait a tick for state updates
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('[data-testid="world-intel-zones"]')).toBeNull();
    expect(container.querySelector('[data-testid="world-intel-countries"]')).toBeNull();
  });
});
