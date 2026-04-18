import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorldNews } from '@/sections/world/WorldNews';

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

const articlesBody = {
  ok: true,
  count: 2,
  data: [
    {
      article_id: 100,
      title: 'Storm hits coast',
      url: 'https://example.com/a/100',
      published_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      source_name: 'Reuters',
      country_iso: 'NZ',
      primary_topic: 'climate',
      sentiment_label: 'neutral',
    },
    {
      article_id: 101,
      title: 'Elections debate',
      url: 'https://example.com/a/101',
      published_at: new Date(Date.now() - 90 * 60_000).toISOString(),
      source_name: 'BBC',
      country_iso: 'GB',
      primary_topic: 'geopolitics',
      sentiment_label: 'negative',
    },
  ],
};

const emptyBody = { ok: true, count: 0, data: [] };

let capturedUrl = '';

beforeEach(() => {
  capturedUrl = '';
  mockFetch((url) => {
    capturedUrl = url;
    const body = url.includes('topics=geopolitics') ? { ...articlesBody, data: [articlesBody.data[1]] } : articlesBody;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorldNews', () => {
  it('renders filter controls + article list on mount', async () => {
    render(<WorldNews />);
    expect(screen.getByTestId('world-news-search')).toBeInTheDocument();
    expect(screen.getByTestId('world-news-topic')).toBeInTheDocument();
    expect(screen.getByTestId('world-news-hours')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('world-news-list')).toBeInTheDocument());
    expect(screen.getByTestId('world-news-100')).toBeInTheDocument();
    expect(screen.getByTestId('world-news-101')).toBeInTheDocument();
  });

  it('topic change triggers refetch with topics= query', async () => {
    render(<WorldNews />);
    await waitFor(() => expect(screen.getByTestId('world-news-list')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('world-news-topic'), { target: { value: 'geopolitics' } });
    await waitFor(() => expect(capturedUrl).toContain('topics=geopolitics'));
  });

  it('search with <2 chars does not add search= query', async () => {
    render(<WorldNews />);
    await waitFor(() => expect(capturedUrl).toContain('/api/wm/news/filtered'));

    fireEvent.change(screen.getByTestId('world-news-search'), { target: { value: 'a' } });
    await waitFor(() => {
      expect(capturedUrl).toContain('/api/wm/news/filtered');
      expect(capturedUrl.includes('search=')).toBe(false);
    });
  });

  it('search with >=2 chars adds search= query', async () => {
    render(<WorldNews />);
    await waitFor(() => expect(screen.getByTestId('world-news-list')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('world-news-search'), { target: { value: 'Iran' } });
    await waitFor(() => expect(capturedUrl).toContain('search=Iran'));
  });

  it('empty response shows empty state', async () => {
    vi.unstubAllGlobals();
    mockFetch(() =>
      new Response(JSON.stringify(emptyBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<WorldNews />);
    await waitFor(() =>
      expect(screen.getByText(/Sin artículos con estos filtros/i)).toBeInTheDocument(),
    );
  });
});
