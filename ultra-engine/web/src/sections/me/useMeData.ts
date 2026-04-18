import { useEndpoint, type EndpointState } from '@/lib/useEndpoint';
import {
  DocumentListSchema,
  TaxDeadlineListSchema,
  VaccinationListSchema,
  SchengenSchema,
  MoodListSchema,
} from './types';
import type { MeDocument, TaxDeadline, Vaccination, MoodEntry } from './types';
import type { z } from 'zod';

type Refetchable<T> = EndpointState<T> & { refetch: () => void };

function unwrapList<T>(res: Refetchable<{ ok: true; data: T[] }>): Refetchable<T[]> {
  if (res.status !== 'ok') return res;
  return { ...res, data: res.data.data };
}

export function useDocuments() {
  return unwrapList<MeDocument>(useEndpoint('/api/documents', DocumentListSchema));
}

export function useTaxDeadlines() {
  return unwrapList<TaxDeadline>(
    useEndpoint('/api/bureaucracy/tax-deadlines', TaxDeadlineListSchema),
  );
}

export function useVaccinations() {
  return unwrapList<Vaccination>(
    useEndpoint('/api/bureaucracy/vaccinations', VaccinationListSchema),
  );
}

export function useSchengen() {
  type Schengen = z.infer<typeof SchengenSchema>['data'];
  const res = useEndpoint('/api/bureaucracy/schengen', SchengenSchema);
  if (res.status !== 'ok') return res as Refetchable<Schengen>;
  return { ...res, data: res.data.data } as Refetchable<Schengen>;
}

export function useRecentMood(limit = 7) {
  const res = useEndpoint(`/api/bio/mood?limit=${limit}`, MoodListSchema);
  if (res.status !== 'ok') return res as Refetchable<{ count: number; data: MoodEntry[] }>;
  return {
    ...res,
    data: { count: res.data.count, data: res.data.data },
  } as Refetchable<{ count: number; data: MoodEntry[] }>;
}
