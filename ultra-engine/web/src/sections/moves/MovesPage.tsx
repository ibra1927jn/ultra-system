import { Route, Routes, Navigate } from 'react-router-dom';
import { t } from '@/i18n/t';
import { SectionShell } from '@/ui/SectionShell';
import { TabNav } from '@/ui/TabNav';
import { MovesOverview } from './MovesOverview';
import { MovesUpcoming } from './MovesUpcoming';
import { MovesMemberships } from './MovesMemberships';
import { MovesPoi } from './MovesPoi';

const TABS = [
  { to: '/app/moves', label: 'moves.tab.overview', testId: 'moves-tab-overview' },
  { to: '/app/moves/upcoming', label: 'moves.tab.upcoming', testId: 'moves-tab-upcoming' },
  { to: '/app/moves/memberships', label: 'moves.tab.memberships', testId: 'moves-tab-memberships' },
  { to: '/app/moves/poi', label: 'moves.tab.poi', testId: 'moves-tab-poi' },
] as const;

export default function MovesPage() {
  const tabs = TABS.map((tab) => ({ to: tab.to, label: t(tab.label), testId: tab.testId }));

  return (
    <SectionShell title={t('moves.title')} subtitle={t('moves.subtitle')} testId="moves-page">
      <TabNav tabs={tabs} testId="moves-tabs" />
      <div className="mt-6">
        <Routes>
          <Route index element={<MovesOverview />} />
          <Route path="upcoming" element={<MovesUpcoming />} />
          <Route path="memberships" element={<MovesMemberships />} />
          <Route path="poi" element={<MovesPoi />} />
          <Route path="*" element={<Navigate to="/app/moves" replace />} />
        </Routes>
      </div>
    </SectionShell>
  );
}
