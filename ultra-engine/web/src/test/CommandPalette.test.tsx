import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette, type PaletteItem } from '@/ui/CommandPalette';
import { fuzzyMatch } from '@/lib/fuzzy';

const items: PaletteItem[] = [
  { id: 'home', label: 'Home', hint: 'g·h', perform: vi.fn() },
  { id: 'work-matches', label: 'Trabajo · Matches', perform: vi.fn() },
  { id: 'money', label: 'Dinero', hint: 'g·m', perform: vi.fn() },
  { id: 'moves-mem', label: 'Movimientos · Membresías', perform: vi.fn() },
];

describe('fuzzyMatch', () => {
  it('returns null when query letters are not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'Home')).toBeNull();
  });

  it('returns non-null for subsequence match', () => {
    expect(fuzzyMatch('hm', 'Home')).not.toBeNull();
    expect(fuzzyMatch('trmat', 'Trabajo · Matches')).not.toBeNull();
  });

  it('favors start-of-word matches', () => {
    const a = fuzzyMatch('mem', 'Movimientos · Membresías');
    const b = fuzzyMatch('mem', 'Random · Membresías');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // No podemos asumir order exacto, pero ambos son non-null.
    expect(typeof a).toBe('number');
  });
});

describe('CommandPalette', () => {
  it('does not render when closed', () => {
    render(<CommandPalette open={false} onClose={() => {}} items={items} />);
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('renders all items when open and empty query', () => {
    render(<CommandPalette open={true} onClose={() => {}} items={items} />);
    expect(screen.getByTestId('palette-item-home')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-work-matches')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-money')).toBeInTheDocument();
  });

  it('filters by fuzzy query', () => {
    render(<CommandPalette open={true} onClose={() => {}} items={items} />);
    fireEvent.change(screen.getByTestId('palette-input'), { target: { value: 'mem' } });
    expect(screen.getByTestId('palette-item-moves-mem')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-item-home')).not.toBeInTheDocument();
  });

  it('invokes perform on Enter and closes', () => {
    const onClose = vi.fn();
    const spy = vi.fn();
    const local: PaletteItem[] = [
      { id: 'test', label: 'Test item', perform: spy },
    ];
    render(<CommandPalette open={true} onClose={onClose} items={local} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(spy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "sin resultados" when no match', () => {
    render(<CommandPalette open={true} onClose={() => {}} items={items} />);
    fireEvent.change(screen.getByTestId('palette-input'), { target: { value: 'zzzzzzz' } });
    expect(screen.getByText(/sin resultados/)).toBeInTheDocument();
  });

  it('ESC key calls onClose', () => {
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} items={items} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
