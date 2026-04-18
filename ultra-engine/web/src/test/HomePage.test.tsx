import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '@/sections/home/HomePage';
import { HomeOverviewSchema } from '@/lib/zod-schemas';

const emptySection = {
  status: 'empty' as const,
  kpi: null,
  label: null,
  badge: 'none' as const,
  preview: null,
  priorityScore: 0,
  error: null,
};

const overviewFixture = {
  generatedAt: new Date().toISOString(),
  mustDo: [],
  partial: false,
  me: emptySection,
  work: emptySection,
  money: emptySection,
  moves: emptySection,
  world: emptySection,
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(overviewFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('fixture matches HomeOverviewSchema', () => {
    expect(() => HomeOverviewSchema.parse(overviewFixture)).not.toThrow();
  });

  it('renders title and 5 section cards', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Resumen de hoy')).toBeInTheDocument();
    expect(screen.getByTestId('home-card-me')).toBeInTheDocument();
    expect(screen.getByTestId('home-card-work')).toBeInTheDocument();
    expect(screen.getByTestId('home-card-money')).toBeInTheDocument();
    expect(screen.getByTestId('home-card-moves')).toBeInTheDocument();
    expect(screen.getByTestId('home-card-world')).toBeInTheDocument();
  });

  it('shows empty must-do message when backend returns no items', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('Nada urgente — buen día.')).toBeInTheDocument(),
    );
  });
});
