import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeCard } from '@/ui/HomeCard';
import type { Section } from '@/lib/zod-schemas';

const baseSection: Section = {
  status: 'ok',
  kpi: 3,
  label: 'tres items',
  badge: 'info',
  preview: [
    { id: 'a', text: 'Item con href', meta: 'meta', href: '/app/money' },
    { id: 'b', text: 'Item sin href', meta: null },
  ],
  priorityScore: 40,
  error: null,
};

describe('HomeCard preview navigation', () => {
  it('renders preview item as Link when href present', () => {
    render(
      <MemoryRouter>
        <HomeCard sectionKey="money" href="/app/money" label="Money" section={baseSection} />
      </MemoryRouter>,
    );

    const link = screen.getByTestId('home-card-money-preview-link-a');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/app/money');
  });

  it('renders preview item as plain div when href missing', () => {
    render(
      <MemoryRouter>
        <HomeCard sectionKey="money" href="/app/money" label="Money" section={baseSection} />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('home-card-money-preview-link-b')).toBeNull();
    expect(screen.getByText('Item sin href')).toBeInTheDocument();
  });

  it('header Link targets the section href', () => {
    render(
      <MemoryRouter>
        <HomeCard sectionKey="me" href="/app/me" label="Me" section={baseSection} />
      </MemoryRouter>,
    );

    const header = screen.getByTestId('home-card-me-header');
    expect(header.tagName).toBe('A');
    expect(header.getAttribute('href')).toBe('/app/me');
  });
});
