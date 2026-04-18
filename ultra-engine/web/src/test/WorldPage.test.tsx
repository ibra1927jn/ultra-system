import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorldPage from '@/sections/world/WorldPage';

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

const pulseBody = {
  ok: true,
  volume: { h1: '25457', h6: '42150', h24: '83972', h48: '146074' },
  top_by_continent: [
    {
      continent: 'Africa',
      title: 'Ceasefire Deal Brings Major Gains',
      source_name: 'Jowhar.com (SO)',
      relevance_score: 24,
      published_at: '2026-04-17T14:44:51Z',
    },
    {
      continent: 'Asia',
      title: 'Iran reopens Strait of Hormuz',
      source_name: 'Korea Herald (KR)',
      relevance_score: 30,
      published_at: '2026-04-18T01:54:16Z',
    },
  ],
  topic_spikes: [
    { topic: 'iran', velocity: '3.4', article_count: 120 },
    { topic: 'climate', velocity: '1.8', article_count: 64 },
  ],
};

const healthBody = {
  ok: true,
  count: 2,
  data: [
    {
      id: 671,
      source: 'WHO',
      country_iso: 'SD',
      alert_level: 'warning',
      disease: 'dengue',
      title: 'After three years of conflict, Sudan faces a deeper health crisis',
      description: 'Three years of war in Sudan...',
      url: 'https://who.int/...',
      published_at: '2026-04-14T16:02:23Z',
      fetched_at: '2026-04-15T08:30:00Z',
    },
    {
      id: 672,
      source: 'CDC',
      country_iso: 'US',
      alert_level: 'advisory',
      disease: 'measles',
      title: 'Measles outbreak update',
      description: null,
      url: 'https://cdc.gov/...',
      published_at: '2026-04-16T10:00:00Z',
      fetched_at: '2026-04-16T11:00:00Z',
    },
  ],
};

beforeEach(() => {
  mockFetch([
    ['/api/wm/news/pulse', pulseBody],
    ['/api/bio/health-alerts', healthBody],
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWorld() {
  return render(
    <MemoryRouter>
      <WorldPage />
    </MemoryRouter>,
  );
}

describe('WorldPage', () => {
  it('renders 4 volume KPIs', async () => {
    renderWorld();
    await waitFor(() => expect(screen.getByTestId('world-kpi-h1')).toBeInTheDocument());
    expect(screen.getByTestId('world-kpi-h24')).toBeInTheDocument();
    expect(screen.getByTestId('world-kpi-spikes')).toBeInTheDocument();
    expect(screen.getByTestId('world-kpi-health')).toBeInTheDocument();
  });

  it('renders continent list + spikes list', async () => {
    renderWorld();
    await waitFor(() => expect(screen.getByTestId('world-continents-list')).toBeInTheDocument());
    expect(screen.getByTestId('world-spikes-list')).toBeInTheDocument();
    expect(screen.getByText(/Ceasefire Deal/)).toBeInTheDocument();
    expect(screen.getByText('iran')).toBeInTheDocument();
  });

  it('renders health alerts list', async () => {
    renderWorld();
    await waitFor(() => expect(screen.getByTestId('world-health-list')).toBeInTheDocument());
    expect(screen.getByText(/Sudan/)).toBeInTheDocument();
    expect(screen.getByText(/Measles/)).toBeInTheDocument();
  });

  it('CTA a /worldmap.html visible', async () => {
    renderWorld();
    expect(screen.getByTestId('world-cta')).toBeInTheDocument();
  });
});
