import { Outlet } from 'react-router-dom';
import { TopBar } from '@/ui/TopBar';
import { useKeyboardNav } from '@/lib/useKeyboardNav';

// Shell global de la SPA. Fase 5: Topbar persistente + atajos de teclado.
// Command palette (Cmd+K) se añade en un bloque posterior — anotado en BLOCKERS.md.
export default function App() {
  useKeyboardNav();
  return (
    <div className="min-h-full bg-bg-base text-fg">
      <TopBar />
      <Outlet />
    </div>
  );
}
