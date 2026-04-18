import { z } from 'zod';

export const NewsPulseSchema = z.object({
  ok: z.literal(true),
  volume: z
    .object({
      h1: z.union([z.string(), z.number()]).nullable(),
      h6: z.union([z.string(), z.number()]).nullable(),
      h24: z.union([z.string(), z.number()]).nullable(),
      h48: z.union([z.string(), z.number()]).nullable(),
    })
    .partial(),
  top_by_continent: z.array(
    z.object({
      continent: z.string(),
      title: z.string(),
      source_name: z.string().nullable(),
      relevance_score: z.union([z.number(), z.string(), z.null()]).optional(),
      published_at: z.string().nullable(),
    }).passthrough(),
  ),
  topic_spikes: z
    .array(
      z.object({
        topic: z.string(),
        velocity: z.union([z.number(), z.string()]),
        article_count: z.union([z.number(), z.string()]),
      }).passthrough(),
    )
    .optional(),
});

export const HealthAlertsSchema = z.object({
  ok: z.literal(true),
  count: z.number(),
  data: z.array(
    z.object({
      id: z.number(),
      source: z.string().nullable(),
      country_iso: z.string().nullable(),
      alert_level: z.string().nullable(),
      disease: z.string().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      url: z.string().nullable(),
      published_at: z.string().nullable(),
      fetched_at: z.string().nullable(),
    }).passthrough(),
  ),
});
