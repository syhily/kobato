import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

export const adminCategoryDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  description: z.string(),
  sortOrder: z.number().int(),
  // Number of live posts (visible + hidden + scheduled) whose
  // `post.category_id` references this row. Mirrors the delete-block
  // guard's view of references — i.e. if `postCount > 0`, deletion via
  // the admin will be rejected with 409. Computed by the service from
  // `countPostsByTaxonomy`; not persisted in the database.
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminCategoryDto = z.infer<typeof adminCategoryDto>
