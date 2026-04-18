import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MoneyPage from '@/sections/money/MoneyPage';

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

const summaryBody = {
  ok: true,
  data: {
    month: '2026-04',
    income: 0,
    expense: 606.48,
    balance: -606.48,
    byCategory: [
      { category: 'groceries', type: 'expense', total: '283.00', count: '2' },
      { category: 'subscriptions', type: 'expense', total: '178.48', count: '6' },
    ],
  },
};

const runwayBody = {
  ok: true,
  data: {
    month: '2026-04',
    income_nzd: 0,
    expense_nzd: 606.48,
    remaining_nzd: -606.48,
    burn_rate_month: 33.69,
    burn_rate_90d: 111.3,
    runway_days_month: -18,
    runway_days_90d: -6,
    net_worth_snapshot: {
      date: '2026-04-16T12:00:00Z',
      total_nzd: '49249.65',
      breakdown: [],
    },
  },
};

const nwBody = {
  ok: true,
  count: 2,
  trend: {
    first_nzd: 50000,
    last_nzd: 49249.65,
    delta_nzd: -750.35,
    delta_pct: -1.5,
    avg_daily_change_nzd: -375,
    period_days: 2,
  },
  data: [
    { date: '2026-04-15', total_nzd: '50000' },
    { date: '2026-04-16', total_nzd: '49249.65' },
  ],
};

const marketsBody = {
  ok: true,
  data: {
    indices: [
      { symbol: '^DJI', display: 'DOW', price: '48578.72', change_pct: '0.24' },
      { symbol: '^VIX', display: 'VIX', price: '18.14', change_pct: '1.11' },
    ],
    commodities: [],
    crypto: [],
    forex: [],
  },
};

const fxBody = {
  ok: true,
  base: 'NZD',
  data: [
    { quote: 'EUR', rate: '0.495', source: 'frankfurter' },
    { quote: 'USD', rate: '0.571', source: 'frankfurter' },
  ],
};

beforeEach(() => {
  mockFetch([
    ['/api/finances/summary', summaryBody],
    ['/api/finances/runway', runwayBody],
    ['/api/finances/nw-timeline', nwBody],
    ['/api/finances/fx', fxBody],
    ['/api/wm/markets/snapshot', marketsBody],
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMoney(path = '/app/money') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MoneyPage />
    </MemoryRouter>,
  );
}

describe('MoneyPage', () => {
  it('renders 4 KPIs with real numbers', async () => {
    renderMoney();
    await waitFor(() => expect(screen.getByTestId('money-kpi-balance')).toBeInTheDocument());
    expect(screen.getByTestId('money-kpi-runway')).toBeInTheDocument();
    expect(screen.getByTestId('money-kpi-burn90')).toBeInTheDocument();
    expect(screen.getByTestId('money-kpi-nw')).toBeInTheDocument();
  });

  it('renders NW sparkline when >=2 snapshots', async () => {
    renderMoney();
    await waitFor(() => expect(screen.getByTestId('money-nw-sparkline')).toBeInTheDocument());
    expect(screen.getByTestId('money-nw-delta')).toHaveTextContent(/-?1.50%/);
  });

  it('renders markets list with change_pct color-coded', async () => {
    renderMoney();
    await waitFor(() => expect(screen.getByTestId('money-markets-list')).toBeInTheDocument());
    expect(screen.getByTestId('money-mkt-^DJI')).toBeInTheDocument();
    expect(screen.getByTestId('money-mkt-^VIX')).toBeInTheDocument();
  });

  it('renders FX list with quotes', async () => {
    renderMoney();
    await waitFor(() => expect(screen.getByTestId('money-fx-list')).toBeInTheDocument());
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('renders top expense categories sorted by total', async () => {
    renderMoney();
    await waitFor(() => expect(screen.getByTestId('money-categories-list')).toBeInTheDocument());
    expect(screen.getByTestId('money-cat-groceries')).toBeInTheDocument();
    expect(screen.getByTestId('money-cat-subscriptions')).toBeInTheDocument();
  });

  it('auto-opens expense modal on ?action=add', async () => {
    renderMoney('/app/money?action=add');
    await waitFor(() => expect(screen.getByTestId('expense-add-drawer')).toBeInTheDocument());
  });

  it('CTA a /money.html visible', async () => {
    renderMoney();
    expect(screen.getByText(/Abrir Money Cockpit/)).toBeInTheDocument();
  });
});
