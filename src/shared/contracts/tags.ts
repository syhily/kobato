import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

export const adminTagDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  ogImage: z.string(),
  // Number of live posts (visible + hidden + scheduled) that reference
  // this row through the `post_tag` join. Mirrors the delete-block
  // guard's view of references — i.e. if `postCount > 0`, deletion via
  // the admin will be rejected with 409. Computed by the service from
  // `countPostsByTaxonomy`; not persisted in the database.
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminTagDto = z.infer<typeof adminTagDto>
