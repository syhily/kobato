import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminTagDto } from '@/shared/types/tags'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

export const adminTagDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  ogImage: z.string(),
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

// ─── parity assertion ──────────────────────────────────
type _adminTagDtoParity = Assert<Equals<z.infer<typeof adminTagDto>, AdminTagDto>>
