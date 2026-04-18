import { SectionShell } from '@/ui/SectionShell';
import { StatBlock } from '@/ui/StatBlock';
import { ListRow } from '@/ui/ListRow';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { LoadingState } from '@/ui/LoadingState';

// Página oculta de stories visuales del UI kit (Fase 2.1).
// No linkeada en navegación. Acceder vía /app/__uikit con sesión.

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-card-title text-fg-muted uppercase tracking-wide">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function UiKitPage() {
  return (
    <SectionShell
      title="UI kit"
      subtitle="Fase 2.1 — stories visuales de cada componente"
      testId="uikit-page"
    >
      <div className="space-y-10">
        <Group title="StatBlock — 4 badges">
          <div className="grid gap-3 md:grid-cols-4">
            <StatBlock kpi={42} label="info" badge="info" testId="stat-info" />
            <StatBlock kpi="3.4h" label="warn" badge="warn" priorityScore={50} testId="stat-warn" />
            <StatBlock kpi={7} label="alert" badge="alert" priorityScore={75} testId="stat-alert" />
            <StatBlock kpi={null} label="empty" badge="none" testId="stat-empty" />
          </div>
        </Group>

        <Group title="ListRow — div / a / button / external">
          <ListRow title="Plain row" subtitle="Sin href ni onClick" testId="row-plain" />
          <ListRow title="Anchor row" subtitle="href interno" href="#" testId="row-anchor" />
          <ListRow
            title="External row"
            subtitle="abre en nueva pestaña"
            href="https://example.com"
            external
            trailing="↗"
            testId="row-external"
          />
          <ListRow
            title="Button row"
            subtitle="onClick"
            onClick={() => alert('clicked')}
            trailing="→"
            testId="row-button"
          />
          <ListRow
            title="With icon"
            subtitle="icono opcional"
            icon={<span aria-hidden>●</span>}
            trailing="meta"
            testId="row-icon"
          />
        </Group>

        <Group title="EmptyState">
          <EmptyState
            title="Sin alertas abiertas"
            description="Vuelve mañana o registra un mood check."
            icon={<span className="text-2xl">·</span>}
            testId="empty-demo"
          />
        </Group>

        <Group title="ErrorState — sin / con retry">
          <ErrorState message="HTTP 500: database unavailable" testId="error-demo" />
          <ErrorState
            message="Schema mismatch: missing field 'partial'"
            onRetry={() => alert('retry')}
            testId="error-retry-demo"
          />
        </Group>

        <Group title="LoadingState — list / card">
          <LoadingState rows={4} variant="list" testId="loading-list" />
          <LoadingState variant="card" testId="loading-card" />
        </Group>
      </div>
    </SectionShell>
  );
}
