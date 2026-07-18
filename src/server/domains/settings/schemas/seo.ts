import { z } from 'zod'

export const seoSchema = z.object({
  toc: z.object({
    minHeadingLevel: z.coerce.number().int().min(1).max(6),
    maxHeadingLevel: z.coerce.number().int().min(1).max(6),
  }),
  // OG canvas dimensions. The renderer (`@/server/render/og/render`) reads
  // these at request time, so editing them here takes effect on the next
  // OG image generation. Bound by sensible X/Facebook card limits
  // (Facebook recommends ≥600×315; X caps at 4096×4096).
  og: z.object({
    width: z.coerce.number().int().min(600).max(4096),
    height: z.coerce.number().int().min(315).max(4096),
  }),
})
