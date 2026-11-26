import { resourceOutputSchema } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const feedScopeInputSchema = z.object({
  category: z.string().optional(),
  tag: z.string().optional(),
  ifNoneMatch: z.string().optional(),
})
export type FeedScopeInput = z.infer<typeof feedScopeInputSchema>

export const feedOutputSchema = resourceOutputSchema
export type FeedOutput = z.infer<typeof feedOutputSchema>
