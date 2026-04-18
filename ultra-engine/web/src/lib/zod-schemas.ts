import { z } from 'zod';

// Contrato del agregador /api/home/overview.
// Mantenido en sync con ultra-engine/src/routes/home.js (Fase 1.2).
// El test de contrato (web/src/test/HomePage.test.tsx + tests/home-overview.test.js)
// hace HomeOverviewSchema.parse(response.body) para evitar drift silencioso.

export const SectionStatus = z.enum(['ok', 'empty', 'error']);
export const Badge = z.enum(['none', 'info', 'warn', 'alert']);

export const PreviewItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  meta: z.string().nullable(),
  href: z.string().nullable().optional(),
});

export const SectionSchema = z.object({
  status: SectionStatus,
  kpi: z.union([z.number(), z.string(), z.null()]),
  label: z.string().nullable(),
  badge: Badge,
  preview: z.array(PreviewItemSchema).max(5).nullable(),
  priorityScore: z.number().int().min(0).max(100),
  error: z.string().nullable(),
});
export type Section = z.infer<typeof SectionSchema>;

export const MustDoItemSchema = z.object({
  id: z.string(),
  source: z.enum(['bureaucracy', 'logistics', 'bio', 'money']),
  title: z.string(),
  dueAt: z.string().datetime().nullable(),
  severity: z.enum(['low', 'med', 'high']),
  href: z.string(),
});
export type MustDoItem = z.infer<typeof MustDoItemSchema>;

export const HomeOverviewSchema = z.object({
  generatedAt: z.string().datetime(),
  mustDo: z.array(MustDoItemSchema).max(5),
  partial: z.boolean(),
  me: SectionSchema,
  work: SectionSchema,
  money: SectionSchema,
  moves: SectionSchema,
  world: SectionSchema,
});
export type HomeOverview = z.infer<typeof HomeOverviewSchema>;
