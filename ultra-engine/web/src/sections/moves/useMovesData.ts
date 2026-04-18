import { useEndpoint, type EndpointState } from '@/lib/useEndpoint';
import {
  LogisticsListSchema,
  Next48hSchema,
  MembershipListSchema,
} from './types';
import type { LogisticsItem, Membership } from './types';

type Refetchable<T> = EndpointState<T> & { refetch: () => void };

export function useUpcoming() {
  const res = useEndpoint('/api/logistics/upcoming', LogisticsListSchema);
  if (res.status !== 'ok') return res as Refetchable<LogisticsItem[]>;
  return { ...res, data: res.data.data } as Refetchable<LogisticsItem[]>;
}

export function useNext48h() {
  return useEndpoint('/api/logistics/next48h', Next48hSchema);
}

export function useMemberships() {
  const res = useEndpoint('/api/logistics/memberships', MembershipListSchema);
  if (res.status !== 'ok') return res as Refetchable<Membership[]>;
  return { ...res, data: res.data.data } as Refetchable<Membership[]>;
}
