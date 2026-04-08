// Phase 1 absorption: Vite's import.meta.env doesn't exist in Node.
// Default to 'full' (the WM main variant). Backend siempre corre full.
export const SITE_VARIANT: string = (() => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (stored === 'tech' || stored === 'full' || stored === 'finance') return stored;
  }
  // En Node, leer de process.env.WM_VARIANT con default 'full'
  return (typeof process !== 'undefined' && process.env?.WM_VARIANT) || 'full';
})();
