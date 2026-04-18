import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MustDoBadge } from '@/ui/MustDoBadge';

let fetchMock: ReturnType<typeof vi.fn>;

function mockWith(mustDo: Array<{ severity: string }>) {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ mustDo }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBadge() {
  return render(
    <MemoryRouter>
      <MustDoBadge />
    </MemoryRouter>,
  );
}

describe('MustDoBadge', () => {
  it('no render cuando mustDo está vacío', async () => {
    mockWith([]);
    renderBadge();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('mustdo-badge-fab')).not.toBeInTheDocument();
  });

  it('renders badge ámbar cuando hay items sin critical', async () => {
    mockWith([{ severity: 'med' }, { severity: 'low' }]);
    renderBadge();
    await waitFor(() => expect(screen.getByTestId('mustdo-badge-fab')).toBeInTheDocument());
    const fab = screen.getByTestId('mustdo-badge-fab');
    expect(fab.className).toContain('attention');
    expect(fab.textContent).toContain('2');
  });

  it('renders badge rojo + "N críticos" cuando hay high', async () => {
    mockWith([{ severity: 'high' }, { severity: 'high' }, { severity: 'med' }]);
    renderBadge();
    await waitFor(() => expect(screen.getByTestId('mustdo-badge-fab')).toBeInTheDocument());
    const fab = screen.getByTestId('mustdo-badge-fab');
    expect(fab.className).toContain('critical');
    expect(fab.textContent).toContain('3');
    expect(fab.textContent).toContain('2 críticos');
  });

  it('link apunta a /app (home)', async () => {
    mockWith([{ severity: 'med' }]);
    renderBadge();
    await waitFor(() => expect(screen.getByTestId('mustdo-badge-fab')).toBeInTheDocument());
    expect(screen.getByTestId('mustdo-badge-fab').getAttribute('href')).toBe('/app');
  });

  it('no falla cuando el fetch devuelve error', async () => {
    fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    renderBadge();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // No render = no badge
    expect(screen.queryByTestId('mustdo-badge-fab')).not.toBeInTheDocument();
  });
});
