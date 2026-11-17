import { idString, isoDateTime } from '@kobato/shared/contracts/primitives.ts'
import { z } from 'zod'

export const adminCategoryDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  description: z.string(),
  sortOrder: z.number().int(),
  // Live post count; mirrors the delete-block guard (postCount > 0 → 409).
  // Computed by the service, not persisted.
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminCategoryDto = z.infer<typeof adminCategoryDto>
