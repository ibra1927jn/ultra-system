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

export const NwTimelineSchema = z.object({
  ok: z.literal(true),
  count: z.number(),
  trend: z
    .object({
      first_nzd: z.union([z.number(), z.string(), z.null()]),
      last_nzd: z.union([z.number(), z.string(), z.null()]),
      delta_nzd: z.union([z.number(), z.string(), z.null()]),
      delta_pct: z.union([z.number(), z.string(), z.null()]),
      avg_daily_change_nzd: z.union([z.number(), z.string(), z.null()]),
      period_days: z.number(),
    })
    .nullable(),
  data: z.array(
    z.object({
      date: z.string(),
      total_nzd: z.union([z.number(), z.string()]),
    }).passthrough(),
  ),
});

export const MarketsSnapshotSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    indices: z.array(
      z.object({
        symbol: z.string(),
        display: z.string(),
        price: z.union([z.number(), z.string()]),
        change_pct: z.union([z.number(), z.string()]),
      }).passthrough(),
    ).default([]),
    commodities: z.array(z.unknown()).default([]),
    crypto: z.array(z.unknown()).default([]),
    forex: z.array(z.unknown()).default([]),
  }).passthrough(),
});

export const FxSchema = z.object({
  ok: z.literal(true),
  base: z.string(),
  data: z.array(
    z.object({
      quote: z.string(),
      rate: z.union([z.number(), z.string()]),
      source: z.string().nullable(),
    }).passthrough(),
  ),
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
