import { z } from 'zod'

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
export type AdminWebmentionWire = z.infer<typeof adminWebmentionDto>
