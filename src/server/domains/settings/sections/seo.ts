import { z } from 'zod'

export const seoSchema = z.object({
  toc: z.object({
    minHeadingLevel: z.coerce.number().int().min(1).max(6),
    maxHeadingLevel: z.coerce.number().int().min(1).max(6),
  }),
  // Bounds follow platform card limits (Facebook ≥600×315, X ≤4096×4096).
  og: z.object({
    width: z.coerce.number().int().min(600).max(4096),
    height: z.coerce.number().int().min(315).max(4096),
  }),
})

export const seoDefaults = {
  toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
  og: { width: 1200, height: 630 },
} as const

export const seoSection = {
  scope: 'blog.seo',
  key: 'seo',
  schema: seoSchema,
  defaults: seoDefaults,
} as const
