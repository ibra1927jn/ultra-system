import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from '@/ui/TopBar';
import { CommandPalette, usePaletteItems } from '@/ui/CommandPalette';
import { ToastProvider } from '@/ui/Toast';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { MustDoBadge } from '@/ui/MustDoBadge';
import { useKeyboardNav } from '@/lib/useKeyboardNav';

// Shell global de la SPA: Topbar + atajos g+letra + Cmd+K palette + ErrorBoundary.
// Cmd+K (Meta) en mac, Ctrl+K en linux/windows. ESC cierra.
export default function App() {
  useKeyboardNav();
  const items = usePaletteItems();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // "/" al estilo GitHub — solo si no hay inputs activos ni modificadores
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-full bg-bg-base text-fg">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <MustDoBadge />
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          items={items}
        />
      </div>
    </ToastProvider>
  );
}
