import { z } from 'zod';
const Reference = z.object({ kind: z.enum(['event','snapshot']), id: z.string().max(200) });
const Difference = z.object({ value: z.string().max(600), baselineCount: z.number().int().nonnegative(), stimulusCount: z.number().int().nonnegative(), references: z.array(Reference).max(12) });
export const BehavioralComparisonSchema = z.object({
  methodologyVersion: z.literal('1.0'), design: z.literal('fresh-browser-contexts-shared-sandbox'),
  status: z.enum(['complete','partial','unavailable']), excludedEvents: z.number().int().nonnegative(),
  limitations: z.array(z.string().max(600)).max(20),
  categories: z.array(z.object({
    category: z.enum(['network','dom','navigation','process','socket','timing']), status: z.enum(['complete','partial','unavailable']),
    baselineCount: z.number().int().nonnegative().optional(), stimulusCount: z.number().int().nonnegative().optional(),
    added: z.number().int().nonnegative(), removed: z.number().int().nonnegative(), changed: z.number().int().nonnegative(), unchanged: z.number().int().nonnegative(),
    differences: z.array(Difference).max(40), truncated: z.boolean(), notes: z.array(z.string().max(600)).max(10),
    metrics: z.array(z.object({name:z.string(),baseline:z.number(),stimulus:z.number(),delta:z.number(),references:z.array(Reference).max(12)})).max(10),
  })).length(6),
});
export type BehavioralComparison = z.infer<typeof BehavioralComparisonSchema>;
export type ComparisonCategory = BehavioralComparison['categories'][number];
