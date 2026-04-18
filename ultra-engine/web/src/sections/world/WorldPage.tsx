import { t } from '@/i18n/t';
import { SectionShell } from '@/ui/SectionShell';

// Fase 4 (World): re-arquitectura completa pendiente — overview/map(calm)/deep.
// Mientras tanto, CTA al cockpit legacy (/worldmap.html · 39 endpoints · 20 workspaces).
export default function WorldPage() {
  return (
    <SectionShell
      title={t('nav.world')}
      subtitle="El mapa operativo completo sigue en /worldmap.html (Fase 4 pendiente)"
      testId="world-page"
      actions={
        <a
          href="/worldmap.html"
          data-testid="world-cta"
          className="rounded border border-accent px-3 py-2 text-meta text-accent hover:bg-accent/10"
        >
          Abrir WorldMonitor
        </a>
      }
    >
      <div className="rounded-lg border border-border bg-bg-panel p-8 text-center">
        <p className="text-card-title text-fg-muted">
          WorldMonitor: 411K artículos · 1480 feeds · 39 endpoints · 20 workspaces
        </p>
        <p className="mt-2 text-meta text-fg-dim">
          Re-arch en 3 modos (overview/map-calm/deep) llega en Fase 4.
        </p>
      </div>
    </SectionShell>
  );
}
