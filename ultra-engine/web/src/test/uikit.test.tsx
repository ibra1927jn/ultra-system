import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionShell } from '@/ui/SectionShell';
import { StatBlock } from '@/ui/StatBlock';
import { ListRow } from '@/ui/ListRow';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { LoadingState } from '@/ui/LoadingState';

describe('SectionShell', () => {
  it('renders title + subtitle + actions + children', () => {
    render(
      <SectionShell title="T" subtitle="S" actions={<button>act</button>} testId="ss">
        <p>body</p>
      </SectionShell>,
    );
    expect(screen.getByTestId('ss')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('act')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});

describe('StatBlock', () => {
  it('renders kpi number + label + badge dot', () => {
    render(<StatBlock kpi={42} label="alerts" badge="alert" testId="sb" />);
    expect(screen.getByTestId('sb')).toHaveTextContent('42');
    expect(screen.getByTestId('sb')).toHaveTextContent('alerts');
  });
  it('renders em-dash when kpi is null', () => {
    render(<StatBlock kpi={null} label="x" testId="sb" />);
    expect(screen.getByTestId('sb')).toHaveTextContent('—');
  });
  it('exposes priorityScore via data attr', () => {
    render(<StatBlock kpi={1} priorityScore={75} testId="sb" />);
    expect(screen.getByTestId('sb').getAttribute('data-priority')).toBe('75');
  });
});

describe('ListRow', () => {
  it('renders <a> when href set', () => {
    render(<ListRow title="t" href="https://x" external testId="r" />);
    const a = screen.getByTestId('r');
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('renders <button> when only onClick set', () => {
    const fn = vi.fn();
    render(<ListRow title="t" onClick={fn} testId="r" />);
    const b = screen.getByTestId('r');
    expect(b.tagName).toBe('BUTTON');
    fireEvent.click(b);
    expect(fn).toHaveBeenCalledOnce();
  });
  it('renders <div> when neither href nor onClick', () => {
    render(<ListRow title="t" testId="r" />);
    expect(screen.getByTestId('r').tagName).toBe('DIV');
  });
});

describe('EmptyState', () => {
  it('renders title + description', () => {
    render(<EmptyState title="nada" description="vacío" />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('nada');
    expect(screen.getByTestId('empty-state')).toHaveTextContent('vacío');
  });
});

describe('ErrorState', () => {
  it('renders message and triggers onRetry', () => {
    const fn = vi.fn();
    render(<ErrorState message="boom" onRetry={fn} />);
    expect(screen.getByTestId('error-state')).toHaveTextContent('boom');
    fireEvent.click(screen.getByText('reintentar'));
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('LoadingState', () => {
  it('renders N skeleton rows in list variant', () => {
    const { container } = render(<LoadingState rows={5} testId="ls" />);
    expect(screen.getByTestId('ls')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('.bg-bg-elev').length).toBeGreaterThanOrEqual(5);
  });
  it('renders card variant', () => {
    render(<LoadingState variant="card" testId="ls" />);
    expect(screen.getByTestId('ls')).toBeInTheDocument();
  });
});
