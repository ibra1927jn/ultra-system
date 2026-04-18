import { z } from 'zod';

// Contrato Work — consumido por useWorkData.
// Los 3 endpoints reusados:
//   GET /api/opportunities            → OpportunityListSchema
//   GET /api/opportunities/pipeline   → PipelineSchema
//   GET /api/opportunities/high-score → HighScoreSchema

export const OppStatusSchema = z.enum([
  'new',
  'contacted',
  'applied',
  'rejected',
  'won',
]);
export type OppStatus = z.infer<typeof OppStatusSchema>;

export const OpportunitySchema = z.object({
  id: z.number(),
  title: z.string(),
  source: z.string().nullable(),
  url: z.string().nullable(),
  category: z.string().nullable(),
  status: OppStatusSchema.nullable(),
  match_score: z.number().nullable(),
  description: z.string().nullable(),
  payout_type: z.string().nullable(),
  salary_min: z.union([z.string(), z.number(), z.null()]),
  salary_max: z.union([z.string(), z.number(), z.null()]),
  currency: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  language_req: z.array(z.string()).nullable(),
  deadline: z.string().nullable(),
  posted_at: z.string().nullable(),
  last_seen: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const OpportunityListSchema = z.object({
  ok: z.literal(true),
  data: z.array(OpportunitySchema),
});

export const PipelineSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    total: z.number(),
    by_status: z.array(z.object({ status: z.string(), count: z.union([z.string(), z.number()]) })),
    conversion_rates: z.object({
      new_to_contacted: z.number(),
      contacted_to_applied: z.number(),
      applied_to_won: z.number(),
      overall_win_rate: z.number(),
    }),
    need_follow_up: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        source: z.string().nullable(),
        created_at: z.string().nullable(),
        days_since_created: z.union([z.string(), z.number(), z.null()]),
      }),
    ),
    upcoming_deadlines: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        deadline: z.string().nullable(),
        status: z.string().nullable(),
        days_until: z.union([z.string(), z.number(), z.null()]),
      }),
    ),
  }),
});
export type Pipeline = z.infer<typeof PipelineSchema>['data'];

export const HighScoreSchema = z.object({
  ok: z.literal(true),
  data: z.array(OpportunitySchema),
  count: z.number().optional(),
});

export const OPP_STATUSES: ReadonlyArray<OppStatus> = [
  'new',
  'contacted',
  'applied',
  'rejected',
  'won',
];
