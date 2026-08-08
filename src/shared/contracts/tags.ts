import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

export const adminTagDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  ogImage: z.string(),
  // Live post count referencing this row via `post_tag` — mirrors the
  // delete-block guard's view (postCount > 0 → 409). Computed by the
  // service, not persisted.
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminTagDto = z.infer<typeof adminTagDto>
