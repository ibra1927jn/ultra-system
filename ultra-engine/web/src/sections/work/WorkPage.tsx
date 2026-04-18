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
import type { Opportunity, OppStatus } from './types';

const TABS = [
  { to: '/app/work', label: 'work.tab.overview', testId: 'work-tab-overview' },
  { to: '/app/work/matches', label: 'work.tab.matches', testId: 'work-tab-matches' },
  { to: '/app/work/pipeline', label: 'work.tab.pipeline', testId: 'work-tab-pipeline' },
] as const;

const STATUS_OPTIONS: ReadonlyArray<OppStatus> = [
  'new', 'contacted', 'applied', 'rejected', 'won',
];

export default function WorkPage() {
  const [openOpp, setOpenOpp] = useState<Opportunity | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const handleStatusChange = async (s: OppStatus) => {
    if (!openOpp) return;
    setActionBusy(true);
    const res = await updateOpportunityStatus(openOpp.id, s);
    setActionBusy(false);
    if (res.ok) {
      setOpenOpp({ ...openOpp, status: s });
    }
  };

  const tabs = TABS.map((tab) => ({ to: tab.to, label: t(tab.label), testId: tab.testId }));

  return (
    <SectionShell title={t('work.title')} subtitle={t('work.subtitle')} testId="work-page">
      <TabNav tabs={tabs} testId="work-tabs" />
      <div className="mt-6">
        <Routes>
          <Route index element={<WorkOverview onOpen={setOpenOpp} />} />
          <Route path="matches" element={<WorkMatches onOpen={setOpenOpp} />} />
          <Route path="pipeline" element={<WorkPipeline onOpen={setOpenOpp} />} />
          <Route path="*" element={<Navigate to="/app/work" replace />} />
        </Routes>
      </div>

      <DetailDrawer
        open={openOpp !== null}
        onClose={() => setOpenOpp(null)}
        title={openOpp?.title ?? ''}
        actions={
          openOpp && (
            <>
              {openOpp.url && (
                <a
                  href={openOpp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-border px-3 py-1 text-meta text-fg hover:border-accent"
                >
                  {t('work.drawer.open')}
                </a>
              )}
              <span className="flex-1" />
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={actionBusy || openOpp.status === s}
                  onClick={() => handleStatusChange(s)}
                  data-testid={`drawer-status-${s}`}
                  className={
                    openOpp.status === s
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
        {openOpp && (
          <div className="space-y-3 text-meta">
            <div className="flex flex-wrap gap-2 text-fg-muted">
              {openOpp.source && <span>fuente: <span className="text-fg">{openOpp.source}</span></span>}
              {openOpp.match_score !== null && (
                <span>
                  score: <span className="text-fg">{openOpp.match_score}</span>
                </span>
              )}
              {openOpp.category && <span>· {openOpp.category}</span>}
              {openOpp.payout_type && <span>· {openOpp.payout_type}</span>}
            </div>
            {openOpp.description && (
              <p className="whitespace-pre-wrap text-fg">{openOpp.description}</p>
            )}
            {openOpp.tags && openOpp.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {openOpp.tags.map((tag) => (
                  <span key={tag} className="rounded bg-bg-elev px-2 py-0.5 text-fg-muted">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {openOpp.deadline && (
              <p className="text-fg-muted">
                deadline: <span className="text-fg">{openOpp.deadline}</span>
              </p>
            )}
          </div>
        )}
      </DetailDrawer>
    </SectionShell>
  );
}
