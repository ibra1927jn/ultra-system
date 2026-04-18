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

// ─── Job listings (traditional employment) ───────────────
export const JobStatusSchema = z.enum(['new', 'saved', 'applied', 'rejected']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: z.number(),
  title: z.string(),
  company: z.string().nullable(),
  url: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  sector: z.string().nullable(),
  location_country: z.string().nullable(),
  location_city: z.string().nullable(),
  location_raw: z.string().nullable(),
  is_remote: z.boolean().nullable(),
  salary_min: z.union([z.string(), z.number(), z.null()]),
  salary_max: z.union([z.string(), z.number(), z.null()]),
  salary_currency: z.string().nullable(),
  visa_sponsorship: z.boolean().nullable(),
  match_score: z.number().nullable(),
  total_score: z.number().nullable(),
  speed_score: z.number().nullable(),
  difficulty_score: z.number().nullable(),
  status: JobStatusSchema.nullable(),
  source_type: z.string().nullable(),
  posted_at: z.string().nullable(),
  scraped_at: z.string().nullable(),
  has_sponsor: z.boolean().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobListSchema = z.object({
  ok: z.literal(true),
  count: z.number(),
  data: z.array(JobSchema),
});

// ─── Unified MatchLike para renderizar opps + jobs con un mismo card ──
export type MatchLike = {
  id: string;          // "opp-42" | "job-123" — único cross-source
  title: string;
  source: string | null; // ej "code4rena" | "seek" | "remoteok"
  url: string | null;
  score: number | null;  // match_score para opps, total_score para jobs
  subtitle: string | null; // compañía o categoría
  status: string | null;
  salary_min: string | number | null;
  salary_max: string | number | null;
  currency: string | null;
  tags: string[];
  description: string | null;
  location: string | null; // "NZ" | "NZ · Auckland" | "remoto"
  visaOk: boolean | null;   // true si visa_sponsorship o has_sponsor
  raw: { kind: 'opp'; opp: Opportunity } | { kind: 'job'; job: Job };
};

export function oppToMatch(o: Opportunity): MatchLike {
  return {
    id: `opp-${o.id}`,
    title: o.title,
    source: o.source,
    url: o.url,
    score: o.match_score,
    subtitle: o.category,
    status: o.status,
    salary_min: o.salary_min,
    salary_max: o.salary_max,
    currency: o.currency,
    tags: o.tags ?? [],
    description: o.description,
    location: null,
    visaOk: null,
    raw: { kind: 'opp', opp: o },
  };
}

export function jobToMatch(j: Job): MatchLike {
  const loc = [j.location_country, j.location_city].filter(Boolean).join(' · ');
  return {
    id: `job-${j.id}`,
    title: j.title,
    source: j.source_type,
    url: j.url,
    score: j.total_score,
    subtitle: j.company,
    status: j.status,
    salary_min: j.salary_min,
    salary_max: j.salary_max,
    currency: j.salary_currency,
    tags: [j.sector, j.category].filter((x): x is string => Boolean(x)),
    description: j.description,
    location: j.is_remote ? 'remoto' : loc || null,
    visaOk: j.visa_sponsorship === true || j.has_sponsor === true,
    raw: { kind: 'job', job: j },
  };
}
