import { resourceOutputSchema } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const sitemapInputSchema = z.object({
  ifNoneMatch: z.string().optional(),
})
export type SitemapInput = z.infer<typeof sitemapInputSchema>

export const sitemapOutputSchema = resourceOutputSchema
export type SitemapOutput = z.infer<typeof sitemapOutputSchema>
