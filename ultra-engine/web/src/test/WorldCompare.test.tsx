import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorldCompare } from '@/sections/world/WorldCompare';

function makeCountry(iso: string, name: string, articles: number, high: number, negPct: number) {
  return {
    iso,
    name,
    activity: {
      article_count: articles,
      high_score: high,
      negative: 10,
      positive: 5,
      avg_score: 1.5,
    },
    sentiment: { positive_pct: 30, neutral_pct: 70 - negPct, negative_pct: negPct },
    risk: null,
    alert: null,
    timeline: [
      { day: '2026-04-10', articles: 50 },
      { day: '2026-04-11', articles: 80 },
      { day: '2026-04-12', articles: 120 },
    ],
    top_article: {
      iso,
      title: `Top story from ${name}`,
      url: `https://example.com/${iso}`,
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let lastUrl = '';

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    lastUrl = url;
    if (url.includes('/api/wm/compare')) {
      const isos = new URL(url, 'http://localhost').searchParams.get('isos') ?? '';
      const list = isos.split(',').filter(Boolean);
      return new Response(
        JSON.stringify({
          ok: true,
          hours: 48,
          count: list.length,
          data: list.map((iso, i) => makeCountry(iso, iso === 'NZ' ? 'New Zealand' : iso, 100 + i * 10, 20, 40)),
        }),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorldCompare', () => {
  it('renders default selection (NZ + ES + DZ) and 3 cards', async () => {
    render(<WorldCompare />);
    await waitFor(() => expect(screen.getByTestId('compare-grid')).toBeInTheDocument());
    expect(screen.getByTestId('compare-card-NZ')).toBeInTheDocument();
    expect(screen.getByTestId('compare-card-ES')).toBeInTheDocument();
    expect(screen.getByTestId('compare-card-DZ')).toBeInTheDocument();
  });

  it('toggles country off when clicking selected preset', async () => {
    render(<WorldCompare />);
    await waitFor(() => expect(screen.getByTestId('compare-card-NZ')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('compare-toggle-NZ'));
    await waitFor(() => expect(screen.queryByTestId('compare-card-NZ')).not.toBeInTheDocument());
  });

  it('adds country when clicking unselected preset (under max 4)', async () => {
    render(<WorldCompare />);
    await waitFor(() => expect(screen.getByTestId('compare-card-NZ')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('compare-toggle-FR'));
    await waitFor(() => expect(screen.getByTestId('compare-card-FR')).toBeInTheDocument());
    expect(lastUrl).toContain('FR');
  });

  it('shows empty state when all countries deselected', async () => {
    render(<WorldCompare />);
    await waitFor(() => expect(screen.getByTestId('compare-card-NZ')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('compare-toggle-NZ'));
    fireEvent.click(screen.getByTestId('compare-toggle-ES'));
    fireEvent.click(screen.getByTestId('compare-toggle-DZ'));
    await waitFor(() => expect(screen.getByText(/Elige 1-4/)).toBeInTheDocument());
  });

  it('renders sparkline when timeline >=2 points', async () => {
    render(<WorldCompare />);
    await waitFor(() => expect(screen.getByTestId('compare-NZ-spark')).toBeInTheDocument());
  });
});
