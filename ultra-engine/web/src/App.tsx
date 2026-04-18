import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from '@/ui/TopBar';
import { CommandPalette, usePaletteItems } from '@/ui/CommandPalette';
import { useKeyboardNav } from '@/lib/useKeyboardNav';

// Shell global de la SPA: Topbar + atajos g+letra + Cmd+K palette.
// Cmd+K (Meta) en mac, Ctrl+K en linux/windows. ESC cierra.
export default function App() {
  useKeyboardNav();
  const items = usePaletteItems();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-full bg-bg-base text-fg">
      <TopBar onOpenPalette={() => setPaletteOpen(true)} />
      <Outlet />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={items}
      />
    </div>
  );
}
