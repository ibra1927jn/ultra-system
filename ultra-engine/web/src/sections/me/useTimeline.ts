import { useDocuments, useTaxDeadlines, useVaccinations } from './useMeData';
import { useMemberships } from '@/sections/moves/useMovesData';

export type TimelineEvent = {
  id: string;
  source: 'doc' | 'tax' | 'vaccine' | 'membership';
  title: string;
  subtitle: string | null;
  daysRemaining: number;
  severity: 'critical' | 'warn' | 'info' | 'expired';
  href: string | null; // link to edit en legacy (MVP: null)
};

function daysNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function severityFor(source: TimelineEvent['source'], days: number): TimelineEvent['severity'] {
  if (days < 0) return 'expired';
  // thresholds por tipo (tax más laxo porque son anuales y planificables)
  const thresholds: Record<TimelineEvent['source'], [number, number]> = {
    doc:        [7,  30],
    vaccine:    [14, 60],
    tax:        [14, 60],
    membership: [30, 90],
  };
  const [crit, warn] = thresholds[source];
  if (days <= crit) return 'critical';
  if (days <= warn) return 'warn';
  return 'info';
}

// Merge 4 data sources → event list sorted por daysRemaining ASC.
// Filtra expirados >30d (ruido) pero mantiene recién-vencidos.
// Cada consumer llamará este hook una vez y mostrará lo que quiera.
export type UseTimeline = {
  status: 'loading' | 'error' | 'ok';
  data: TimelineEvent[];
  error: string | null;
  partial: boolean; // true si alguna fuente falló
};

export function useTimeline(): UseTimeline {
  const docs = useDocuments();
  const tax = useTaxDeadlines();
  const vacc = useVaccinations();
  const mem = useMemberships();

  const loadings = [docs, tax, vacc, mem].filter((s) => s.status === 'loading').length;
  const errors = [docs, tax, vacc, mem].filter((s) => s.status === 'error').length;

  if (loadings === 4) return { status: 'loading', data: [], error: null, partial: false };
  if (errors === 4) return { status: 'error', data: [], error: 'all sources failed', partial: false };

  const events: TimelineEvent[] = [];

  if (docs.status === 'ok') {
    for (const d of docs.data) {
      const n = daysNum(d.days_remaining);
      if (n === null) continue;
      if (n < -30) continue;
      events.push({
        id: `doc-${d.id}`,
        source: 'doc',
        title: d.document_name,
        subtitle: d.document_type,
        daysRemaining: n,
        severity: severityFor('doc', n),
        href: null,
      });
    }
  }

  if (tax.status === 'ok') {
    for (const t of tax.data) {
      const n = daysNum(t.days_remaining);
      if (n === null) continue;
      if (n < -30) continue;
      if (n > 365) continue; // ignora deadlines >1 año
      events.push({
        id: `tax-${t.id}`,
        source: 'tax',
        title: t.name,
        subtitle: t.country,
        daysRemaining: n,
        severity: severityFor('tax', n),
        href: null,
      });
    }
  }

  if (vacc.status === 'ok') {
    for (const v of vacc.data) {
      const n = daysNum(v.days_remaining);
      if (n === null) continue;
      if (n < -30) continue;
      events.push({
        id: `vacc-${v.id}`,
        source: 'vaccine',
        title: `${v.vaccine}${v.dose_number ? ` · dosis ${v.dose_number}` : ''}`,
        subtitle: v.country ?? v.location,
        daysRemaining: n,
        severity: severityFor('vaccine', n),
        href: null,
      });
    }
  }

  if (mem.status === 'ok') {
    for (const m of mem.data) {
      const n = daysNum(m.days_to_renewal);
      if (n === null) continue;
      if (n < -30) continue;
      events.push({
        id: `mem-${m.id}`,
        source: 'membership',
        title: m.platform,
        subtitle: m.annual_cost ? `${m.annual_cost} ${m.currency ?? ''}/yr` : null,
        daysRemaining: n,
        severity: severityFor('membership', n),
        href: null,
      });
    }
  }

  events.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    status: 'ok',
    data: events,
    error: null,
    partial: errors > 0,
  };
}
