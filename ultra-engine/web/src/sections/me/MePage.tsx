import { Route, Routes, Navigate } from 'react-router-dom';
import { t } from '@/i18n/t';
import { SectionShell } from '@/ui/SectionShell';
import { TabNav } from '@/ui/TabNav';
import { MeOverview } from './MeOverview';
import { MeDocs } from './MeDocs';
import { MeBio } from './MeBio';

const TABS = [
  { to: '/app/me', label: 'me.tab.overview', testId: 'me-tab-overview' },
  { to: '/app/me/docs', label: 'me.tab.docs', testId: 'me-tab-docs' },
  { to: '/app/me/bio', label: 'me.tab.bio', testId: 'me-tab-bio' },
] as const;

export default function MePage() {
  const tabs = TABS.map((tab) => ({ to: tab.to, label: t(tab.label), testId: tab.testId }));

  return (
    <SectionShell title={t('me.title')} subtitle={t('me.subtitle')} testId="me-page">
      <TabNav tabs={tabs} testId="me-tabs" />
      <div className="mt-6">
        <Routes>
          <Route index element={<MeOverview />} />
          <Route path="docs" element={<MeDocs />} />
          <Route path="bio" element={<MeBio />} />
          <Route path="*" element={<Navigate to="/app/me" replace />} />
        </Routes>
      </div>
    </SectionShell>
  );
}
