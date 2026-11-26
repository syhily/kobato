import { mediaResourceOutputSchema } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const storageObjectInputSchema = z.object({
  path: z.string().min(1).max(2000),
  ifNoneMatch: z.string().optional(),
  range: z.string().optional(),
  search: z.string().max(2000).optional(),
})
export type StorageObjectInput = z.input<typeof storageObjectInputSchema>

export const storageObjectOutputSchema = mediaResourceOutputSchema
export type StorageObjectOutput = z.infer<typeof storageObjectOutputSchema>
