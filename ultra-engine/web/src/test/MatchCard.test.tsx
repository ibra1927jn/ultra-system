import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchCard } from '@/ui/MatchCard';
import { oppToMatch, jobToMatch, type Opportunity, type Job } from '@/sections/work/types';

function oppFixture(overrides: Partial<Opportunity> = {}): Opportunity {
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

function jobFixture(overrides: Partial<Job> = {}): Job {
  return {
    id: 42,
    title: 'Senior Rust Engineer',
    company: 'Rocket Lab',
    url: 'https://seek.co.nz/job/42',
    description: 'Build rust services at scale.',
    category: 'software',
    sector: 'engineering',
    location_country: 'NZ',
    location_city: 'Auckland',
    location_raw: 'Auckland, NZ',
    is_remote: false,
    salary_min: 120000,
    salary_max: 160000,
    salary_currency: 'NZD',
    visa_sponsorship: true,
    match_score: 40,
    total_score: 67,
    speed_score: 10,
    difficulty_score: 5,
    status: 'new',
    source_type: 'api',
    posted_at: '2026-04-17T10:00:00Z',
    scraped_at: '2026-04-18T00:00:00Z',
    has_sponsor: true,
    ...overrides,
  };
}

describe('MatchCard (opp adapter)', () => {
  it('renders title, score, source and salary range', () => {
    render(<MatchCard match={oppToMatch(oppFixture())} />);
    expect(screen.getByText(/Solidity auditor/)).toBeInTheDocument();
    expect(screen.getByTestId('match-opp-1-score')).toHaveTextContent('18');
    expect(screen.getByText(/code4rena/)).toBeInTheDocument();
    expect(screen.getByText(/5,000.*20,000.*USD/)).toBeInTheDocument();
  });

  it('calls onOpen with the match when clicked', () => {
    const spy = vi.fn();
    render(<MatchCard match={oppToMatch(oppFixture())} onOpen={spy} />);
    fireEvent.click(screen.getByTestId('match-opp-1'));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'opp-1' }));
  });

  it('variant=detailed shows description and tags', () => {
    render(<MatchCard match={oppToMatch(oppFixture())} variant="detailed" />);
    expect(screen.getByText(/reentrancy/)).toBeInTheDocument();
    expect(screen.getByText('solidity')).toBeInTheDocument();
    expect(screen.getByText('defi')).toBeInTheDocument();
  });

  it('renders em-dash when match_score is null', () => {
    render(<MatchCard match={oppToMatch(oppFixture({ match_score: null }))} />);
    expect(screen.getByTestId('match-opp-1-score')).toHaveTextContent('—');
  });

  it('renders single-sided salary when only one bound exists', () => {
    render(<MatchCard match={oppToMatch(oppFixture({ salary_min: null, salary_max: '3000' }))} />);
    expect(screen.getByText(/3,000.*USD/)).toBeInTheDocument();
  });
});

describe('MatchCard (job adapter)', () => {
  it('renders job title, company, location and visa badge when sponsored', () => {
    render(<MatchCard match={jobToMatch(jobFixture())} />);
    expect(screen.getByText(/Senior Rust Engineer/)).toBeInTheDocument();
    expect(screen.getByText('Rocket Lab')).toBeInTheDocument();
    expect(screen.getByText(/NZ · Auckland/)).toBeInTheDocument();
    expect(screen.getByTestId('match-job-42-visa')).toHaveTextContent('visa ok');
  });

  it('shows "remoto" when is_remote is true', () => {
    render(<MatchCard match={jobToMatch(jobFixture({ is_remote: true }))} />);
    expect(screen.getByText(/remoto/)).toBeInTheDocument();
  });

  it('no visa badge when neither visa_sponsorship nor has_sponsor', () => {
    render(
      <MatchCard
        match={jobToMatch(jobFixture({ visa_sponsorship: false, has_sponsor: false }))}
      />,
    );
    expect(screen.queryByTestId('match-job-42-visa')).not.toBeInTheDocument();
  });
});
