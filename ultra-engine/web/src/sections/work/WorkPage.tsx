import { useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { t } from '@/i18n/t';
import { SectionShell } from '@/ui/SectionShell';
import { TabNav } from '@/ui/TabNav';
import { DetailDrawer } from '@/ui/DetailDrawer';
import { WorkOverview } from './WorkOverview';
import { WorkMatches } from './WorkMatches';
import { WorkPipeline } from './WorkPipeline';
import { updateOpportunityStatus } from './useWorkData';
import type { MatchLike, OppStatus } from './types';

const TABS = [
  { to: '/app/work', label: 'work.tab.overview', testId: 'work-tab-overview' },
  { to: '/app/work/matches', label: 'work.tab.matches', testId: 'work-tab-matches' },
  { to: '/app/work/pipeline', label: 'work.tab.pipeline', testId: 'work-tab-pipeline' },
] as const;

const STATUS_OPTIONS: ReadonlyArray<OppStatus> = [
  'new', 'contacted', 'applied', 'rejected', 'won',
];

export default function WorkPage() {
  const [open, setOpen] = useState<MatchLike | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const handleStatusChange = async (s: OppStatus) => {
    if (!open || open.raw.kind !== 'opp') return;
    setActionBusy(true);
    const res = await updateOpportunityStatus(open.raw.opp.id, s);
    setActionBusy(false);
    if (res.ok) {
      setOpen({ ...open, status: s, raw: { kind: 'opp', opp: { ...open.raw.opp, status: s } } });
    }
  };

  const tabs = TABS.map((tab) => ({ to: tab.to, label: t(tab.label), testId: tab.testId }));

  return (
    <SectionShell title={t('work.title')} subtitle={t('work.subtitle')} testId="work-page">
      <TabNav tabs={tabs} testId="work-tabs" />
      <div className="mt-6">
        <Routes>
          <Route index element={<WorkOverview onOpen={setOpen} />} />
          <Route path="matches" element={<WorkMatches onOpen={setOpen} />} />
          <Route path="pipeline" element={<WorkPipeline onOpen={setOpen} />} />
          <Route path="*" element={<Navigate to="/app/work" replace />} />
        </Routes>
      </div>

      <DetailDrawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.title ?? ''}
        actions={
          open && (
            <>
              {open.url && (
                <a
                  href={open.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-border px-3 py-1 text-meta text-fg hover:border-accent"
                >
                  {t('work.drawer.open')}
                </a>
              )}
              <span className="flex-1" />
              {open.raw.kind === 'opp' &&
                STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={actionBusy || open.status === s}
                    onClick={() => handleStatusChange(s)}
                    data-testid={`drawer-status-${s}`}
                    className={
                      open.status === s
                        ? 'rounded border border-accent px-3 py-1 text-meta text-accent'
                        : 'rounded border border-border px-3 py-1 text-meta text-fg hover:border-accent disabled:opacity-50'
                    }
                  >
                    {t(`status.${s}` as const)}
                  </button>
                ))}
            </>
          )
        }
      >
        {open && (
          <div className="space-y-3 text-meta">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-fg-muted">
              {open.source && (
                <span>
                  fuente: <span className="text-fg">{open.source}</span>
                </span>
              )}
              {open.score !== null && (
                <span>
                  score: <span className="text-fg">{open.score}</span>
                </span>
              )}
              {open.subtitle && <span>· {open.subtitle}</span>}
              {open.location && <span>· {open.location}</span>}
              {open.visaOk === true && (
                <span className="rounded bg-accent/15 px-2 py-0.5 text-accent">visa ok</span>
              )}
            </div>
            {open.description && (
              <p className="whitespace-pre-wrap text-fg">{open.description}</p>
            )}
            {open.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {open.tags.map((tag) => (
                  <span key={tag} className="rounded bg-bg-elev px-2 py-0.5 text-fg-muted">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {open.raw.kind === 'opp' && open.raw.opp.deadline && (
              <p className="text-fg-muted">
                deadline: <span className="text-fg">{open.raw.opp.deadline}</span>
              </p>
            )}
          </div>
        )}
      </DetailDrawer>
    </SectionShell>
  );
}
