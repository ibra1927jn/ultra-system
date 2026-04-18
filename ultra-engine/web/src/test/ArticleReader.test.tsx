import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArticleReader } from '@/sections/world/ArticleReader';

let fetchMock: ReturnType<typeof vi.fn>;

const articleBody = {
  ok: true,
  data: {
    article: {
      id: 42,
      title: 'Iran reopens Strait of Hormuz',
      url: 'https://example.com/iran',
      summary: 'Iran announced the reopening of the Strait.',
      auto_summary: 'Iran reopened Hormuz after the ceasefire.',
      published_at: '2026-04-17T22:19:49Z',
      source_name: 'Korea Herald (KR)',
      relevance_score: 30,
      sentiment_label: 'negative',
      sentiment_score: '0.69',
      entities: [
        { text: 'Iran', label: 'GPE' },
        { text: 'Hormuz', label: 'LOC' },
        { text: 'Trump', label: 'PERSON' },
      ],
      primary_topic: 'geopolitics',
      country_iso: 'KR',
    },
  },
};

const fulltextBody = {
  ok: true,
  data: {
    paragraphs: ['Para 1 of the article.', 'Para 2 con más detalle.'],
    word_count: 420,
    author: 'Kim',
    sitename: 'Korea Herald',
    language: 'en',
  },
};

const translateBody = { ok: true, data: { translated: 'Irán reabre Ormuz…' } };

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/wm/article/42/fulltext')) {
      return new Response(JSON.stringify(fulltextBody), { status: 200 });
    }
    if (url.includes('/api/wm/article/42')) {
      return new Response(JSON.stringify(articleBody), { status: 200 });
    }
    if (url.includes('/api/wm/translate') && init?.method === 'POST') {
      return new Response(JSON.stringify(translateBody), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ArticleReader', () => {
  it('does not render when articleId null', () => {
    render(<ArticleReader articleId={null} onClose={() => {}} />);
    expect(screen.queryByTestId('article-reader')).not.toBeInTheDocument();
  });

  it('renders title + metadata + auto-summary + entities', async () => {
    render(<ArticleReader articleId={42} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Iran reopens Strait/)).toBeInTheDocument());
    expect(screen.getByText(/Korea Herald/)).toBeInTheDocument();
    expect(screen.getByText(/reopened Hormuz/)).toBeInTheDocument();
    expect(screen.getByText('Iran')).toBeInTheDocument();
    expect(screen.getByText('Trump')).toBeInTheDocument();
  });

  it('fetchFullText loads paragraphs on click', async () => {
    render(<ArticleReader articleId={42} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('reader-fetch-fulltext')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('reader-fetch-fulltext'));
    await waitFor(() => expect(screen.getByTestId('reader-fulltext')).toBeInTheDocument());
    expect(screen.getByText(/Para 1/)).toBeInTheDocument();
    expect(screen.getByText(/Para 2/)).toBeInTheDocument();
    expect(screen.getByText(/420 palabras/)).toBeInTheDocument();
  });

  it('translate POSTs and shows translation', async () => {
    render(<ArticleReader articleId={42} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('reader-translate')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('reader-translate'));
    await waitFor(() => expect(screen.getByTestId('reader-translation')).toBeInTheDocument());
    expect(screen.getByText(/Irán reabre/)).toBeInTheDocument();
    const translatePost = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/api/wm/translate'),
    );
    expect(translatePost).toBeDefined();
  });

  it('shows error when article fetch fails', async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response('err', { status: 500 }),
    );
    render(<ArticleReader articleId={42} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/HTTP 500/)).toBeInTheDocument());
  });
});
