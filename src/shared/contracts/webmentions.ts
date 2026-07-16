import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminWebmentionWire } from '@/shared/types/webmentions'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

export const adminWebmentionDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  targetUrl: z.string(),
  targetType: z.enum(['post', 'page']),
  status: z.enum(['pending', 'approved', 'rejected']),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  fetchedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  moderatedAt: isoDateTime.nullable(),
})

// ─── parity assertion ──────────────────────────────────
type _adminWebmentionDtoParity = Assert<Equals<z.infer<typeof adminWebmentionDto>, AdminWebmentionWire>>
