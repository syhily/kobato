import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

export const adminTagDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  ogImage: z.string(),
  // Live post count; mirrors the delete-block guard (postCount > 0 → 409).
  // Computed by the service, not persisted.
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminTagDto = z.infer<typeof adminTagDto>
