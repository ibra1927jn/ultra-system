import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { z } from 'zod';
import { useSection } from '@/lib/useSection';

const Envelope = z.object({
  generatedAt: z.string().datetime(),
  partial: z.boolean(),
  data: z.object({ count: z.number() }),
});

const goodBody = {
  generatedAt: new Date().toISOString(),
  partial: false,
  data: { count: 7 },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(goodBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('useSection', () => {
  it('loads and exposes data + partial + generatedAt', async () => {
    const { result } = renderHook(() => useSection('/x', Envelope));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ok'));
    if (result.current.status === 'ok') {
      expect(result.current.data.count).toBe(7);
      expect(result.current.partial).toBe(false);
    }
  });

  it('exposes error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    const { result } = renderHook(() => useSection('/x', Envelope));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('refetch re-runs the request', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify(goodBody), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useSection('/x', Envelope));
    await waitFor(() => expect(result.current.status).toBe('ok'));
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
