import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchCard } from '@/ui/MatchCard';
import type { Opportunity } from '@/sections/work/types';

function fixture(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 1,
    title: 'Solidity auditor — Code4rena',
    source: 'code4rena',
    url: 'https://code4rena.com/audits/example',
    category: 'audit',
    status: 'new',
    match_score: 18,
    description: 'Review contracts for reentrancy and oracle manipulation.',
    payout_type: 'fixed',
    salary_min: '5000',
    salary_max: '20000',
    currency: 'USD',
    tags: ['solidity', 'defi'],
    language_req: ['en'],
    deadline: '2026-05-01',
    posted_at: '2026-04-15T12:00:00Z',
    last_seen: '2026-04-18T00:00:00Z',
    created_at: '2026-04-15T12:00:00Z',
    ...overrides,
  };
}

describe('MatchCard', () => {
  it('renders title, score, source and salary range', () => {
    render(<MatchCard opp={fixture()} />);
    expect(screen.getByText(/Solidity auditor/)).toBeInTheDocument();
    expect(screen.getByTestId('match-1-score')).toHaveTextContent('18');
    expect(screen.getByText('code4rena')).toBeInTheDocument();
    expect(screen.getByText(/5,000.*20,000.*USD/)).toBeInTheDocument();
  });

  it('calls onOpen with the opp when clicked', () => {
    const spy = vi.fn();
    render(<MatchCard opp={fixture()} onOpen={spy} />);
    fireEvent.click(screen.getByTestId('match-1'));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('variant=detailed shows description and tags', () => {
    render(<MatchCard opp={fixture()} variant="detailed" />);
    expect(screen.getByText(/reentrancy/)).toBeInTheDocument();
    expect(screen.getByText('solidity')).toBeInTheDocument();
    expect(screen.getByText('defi')).toBeInTheDocument();
  });

  it('renders em-dash when match_score is null', () => {
    render(<MatchCard opp={fixture({ match_score: null })} />);
    expect(screen.getByTestId('match-1-score')).toHaveTextContent('—');
  });

  it('renders single-sided salary when only one bound exists', () => {
    render(<MatchCard opp={fixture({ salary_min: null, salary_max: '3000' })} />);
    expect(screen.getByText(/3,000.*USD/)).toBeInTheDocument();
  });
});
