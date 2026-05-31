import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminCategoryDto } from '@/shared/types/categories'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

export const adminCategoryDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  description: z.string(),
  sortOrder: z.number().int(),
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

// ─── parity assertion ──────────────────────────────────
type _adminCategoryDtoParity = Assert<Equals<z.infer<typeof adminCategoryDto>, AdminCategoryDto>>
