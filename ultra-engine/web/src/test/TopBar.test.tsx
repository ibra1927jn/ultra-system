import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from '@/ui/TopBar';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/auth/me')) {
      return new Response(
        JSON.stringify({ ok: true, id: 1, email: 'admin@ibrahim.ops' }),
        { status: 200 },
      );
    }
    if (url.includes('/api/auth/logout')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderTopBar(props: Parameters<typeof TopBar>[0] = {}) {
  return render(
    <MemoryRouter>
      <TopBar {...props} />
    </MemoryRouter>,
  );
}

describe('TopBar', () => {
  it('renders brand + 5 nav links (me/work/money/moves/world)', () => {
    renderTopBar();
    expect(screen.getByTestId('topbar-brand')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-me')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-work')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-money')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-moves')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-world')).toBeInTheDocument();
  });

  it('renders palette button when onOpenPalette provided', () => {
    renderTopBar({ onOpenPalette: () => {} });
    expect(screen.getByTestId('topbar-palette')).toBeInTheDocument();
  });

  it('fetches and displays email in user menu', async () => {
    renderTopBar();
    await waitFor(() =>
      expect(screen.getByTestId('topbar-user')).toHaveTextContent(/admin@ibrahim/),
    );
  });

  it('opens user menu on click', async () => {
    renderTopBar();
    await waitFor(() => expect(screen.getByTestId('topbar-user')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('topbar-user'));
    expect(screen.getByTestId('topbar-user-menu')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-logout')).toBeInTheDocument();
  });

  it('POSTs logout when clicked', async () => {
    // Necesitamos stub window.location para que el redirect no lance.
    const origLoc = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...origLoc, href: '' },
    });
    renderTopBar();
    await waitFor(() => expect(screen.getByTestId('topbar-user')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('topbar-user'));
    fireEvent.click(screen.getByTestId('topbar-logout'));
    await waitFor(() => {
      const logoutCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/auth/logout'),
      );
      expect(logoutCalls.length).toBe(1);
    });
    Object.defineProperty(window, 'location', { writable: true, value: origLoc });
  });
});
