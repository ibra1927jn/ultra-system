import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOPBAR_SECTIONS } from '@/ui/TopBar';

// Atajos tipo vim: `g` seguido de letra en < 1.2s navega a la sección.
// g·h home, g·e me, g·w work, g·m money, g·v moves, g·g world.
// Ignora si el foco está en un input/textarea/contenteditable o si hay modificadores.
export function useKeyboardNav() {
  const navigate = useNavigate();
  const pendingGRef = useRef<number | null>(null);

  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const clearPending = () => {
      if (pendingGRef.current !== null) {
        window.clearTimeout(pendingGRef.current);
        pendingGRef.current = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;

      // Primera tecla 'g' → armar la chord.
      if (e.key === 'g' && pendingGRef.current === null) {
        pendingGRef.current = window.setTimeout(() => {
          pendingGRef.current = null;
        }, 1200);
        return;
      }

      // Segunda tecla mientras chord está armada.
      if (pendingGRef.current !== null) {
        clearPending();
        const match = TOPBAR_SECTIONS.find((s) => s.key === e.key);
        if (match) {
          e.preventDefault();
          navigate(match.to);
        }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearPending();
    };
  }, [navigate]);
}
