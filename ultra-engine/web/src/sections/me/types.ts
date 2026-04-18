import { z } from 'zod';

// Me pillar: documents + vaccinations + tax deadlines + schengen + bio.
// Reusa APIs existentes sin crear endpoints nuevos.

export const DocumentSchema = z.object({
  id: z.number(),
  document_name: z.string(),
  document_type: z.string().nullable(),
  expiry_date: z.string().nullable(),
  alert_days: z.number().nullable(),
  notes: z.string().nullable(),
  is_active: z.boolean().nullable(),
  days_remaining: z.union([z.string(), z.number(), z.null()]),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type MeDocument = z.infer<typeof DocumentSchema>;

export const DocumentListSchema = z.object({
  ok: z.literal(true),
  data: z.array(DocumentSchema),
});

export const TaxDeadlineSchema = z.object({
  id: z.number(),
  country: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  deadline: z.string().nullable(),
  recurring: z.boolean().nullable(),
  recurrence_rule: z.string().nullable(),
  alert_days_array: z.array(z.number()).nullable(),
  is_active: z.boolean().nullable(),
  notes: z.string().nullable(),
  days_remaining: z.union([z.string(), z.number(), z.null()]),
});
export type TaxDeadline = z.infer<typeof TaxDeadlineSchema>;

export const TaxDeadlineListSchema = z.object({
  ok: z.literal(true),
  data: z.array(TaxDeadlineSchema),
});

export const VaccinationSchema = z.object({
  id: z.number(),
  vaccine: z.string(),
  dose_number: z.number().nullable(),
  date_given: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  batch_number: z.string().nullable(),
  expiry_date: z.string().nullable(),
  certificate_url: z.string().nullable(),
  paperless_id: z.union([z.string(), z.number(), z.null()]),
  notes: z.string().nullable(),
  days_remaining: z.union([z.string(), z.number(), z.null()]),
});
export type Vaccination = z.infer<typeof VaccinationSchema>;

export const VaccinationListSchema = z.object({
  ok: z.literal(true),
  data: z.array(VaccinationSchema),
});

export const SchengenSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    target_date: z.string(),
    window_start: z.string(),
    window_end: z.string(),
    days_used: z.number(),
    days_remaining: z.number(),
    overstay: z.boolean(),
    total_trips_logged: z.number(),
  }),
});

export const MoodEntrySchema = z.object({
  id: z.number(),
  mood: z.union([z.number(), z.string(), z.null()]),
  energy: z.union([z.number(), z.string(), z.null()]),
  notes: z.string().nullable(),
  logged_at: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type MoodEntry = z.infer<typeof MoodEntrySchema>;

export const MoodListSchema = z.object({
  ok: z.literal(true),
  count: z.number(),
  averages: z
    .object({
      mood: z.union([z.number(), z.string(), z.null()]),
      energy: z.union([z.number(), z.string(), z.null()]),
    })
    .nullable(),
  data: z.array(MoodEntrySchema),
});
