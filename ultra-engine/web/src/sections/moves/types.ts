import { z } from 'zod';

export const LogisticsItemSchema = z.object({
  id: z.number(),
  type: z.string().nullable(),
  title: z.string().nullable(),
  date: z.string().nullable(),
  location: z.string().nullable(),
  cost: z.union([z.string(), z.number(), z.null()]),
  notes: z.string().nullable(),
  days_until: z.union([z.string(), z.number(), z.null()]).optional(),
  urgency: z.string().nullable().optional(),
});
export type LogisticsItem = z.infer<typeof LogisticsItemSchema>;

export const LogisticsListSchema = z.object({
  ok: z.literal(true),
  data: z.array(LogisticsItemSchema),
});

export const Next48hSchema = z.object({
  ok: z.literal(true),
  count: z.number(),
  summary: z.object({
    critical: z.number(),
    urgent: z.number(),
    upcoming: z.number(),
  }),
  data: z.array(LogisticsItemSchema),
});

export const MembershipSchema = z.object({
  id: z.number(),
  platform: z.string(),
  annual_cost: z.union([z.string(), z.number(), z.null()]),
  currency: z.string().nullable(),
  renews_at: z.string().nullable(),
  last_paid_at: z.string().nullable(),
  auto_renew: z.boolean().nullable(),
  notes: z.string().nullable(),
  is_active: z.boolean().nullable(),
  days_to_renewal: z.union([z.string(), z.number(), z.null()]),
});
export type Membership = z.infer<typeof MembershipSchema>;

export const MembershipListSchema = z.object({
  ok: z.literal(true),
  data: z.array(MembershipSchema),
});

export const PoiSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  latitude: z.union([z.string(), z.number(), z.null()]),
  longitude: z.union([z.string(), z.number(), z.null()]),
  poi_type: z.string().nullable(),
  source: z.string().nullable(),
  has_water: z.boolean().nullable(),
  has_dump: z.boolean().nullable(),
  has_shower: z.boolean().nullable(),
  has_wifi: z.boolean().nullable(),
  has_power: z.boolean().nullable(),
  is_free: z.boolean().nullable().optional(),
  tags: z.record(z.string(), z.unknown()).nullable(),
  notes: z.string().nullable(),
});
export type Poi = z.infer<typeof PoiSchema>;

export const PoiListSchema = z.object({
  ok: z.literal(true),
  count: z.number(),
  fetched: z.number().nullable(),
  data: z.array(PoiSchema),
});
