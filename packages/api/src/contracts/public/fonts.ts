import { mediaResourceOutputSchema } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const embeddedFontInputSchema = z.object({
  path: z.string().min(1).max(2000),
  ifNoneMatch: z.string().optional(),
  range: z.string().optional(),
  search: z.string().max(2000).optional(),
})
export type EmbeddedFontInput = z.input<typeof embeddedFontInputSchema>

export const embeddedFontOutputSchema = mediaResourceOutputSchema
export type EmbeddedFontOutput = z.infer<typeof embeddedFontOutputSchema>
