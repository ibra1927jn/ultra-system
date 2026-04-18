import { z } from 'zod';

export const SummarySchema = z.object({
  ok: z.literal(true),
  data: z.object({
    month: z.string(),
    income: z.union([z.number(), z.string()]),
    expense: z.union([z.number(), z.string()]),
    balance: z.union([z.number(), z.string()]),
    byCategory: z.array(
      z.object({
        category: z.string(),
        type: z.string(),
        total: z.union([z.number(), z.string()]),
        count: z.union([z.number(), z.string()]),
      }),
    ),
  }),
});

export const RunwaySchema = z.object({
  ok: z.literal(true),
  data: z.object({
    month: z.string(),
    income_nzd: z.number(),
    expense_nzd: z.number(),
    remaining_nzd: z.number(),
    burn_rate_month: z.number(),
    burn_rate_90d: z.number(),
    runway_days_month: z.number(),
    runway_days_90d: z.number(),
    net_worth_snapshot: z
      .object({
        date: z.string().nullable(),
        total_nzd: z.union([z.string(), z.number(), z.null()]),
        breakdown: z.array(z.unknown()).nullable(),
      })
      .nullable(),
  }),
});
