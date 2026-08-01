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

// Outbound mirror: the send log row, read-only in the admin shell.
export const adminWebmentionOutboxDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  targetUrl: z.string(),
  endpoint: z.string().nullable(),
  status: z.enum(['pending', 'sent', 'no-endpoint', 'failed']),
  attempts: z.number().int(),
  nextRetryAt: isoDateTime.nullable(),
  lastError: z.string().nullable(),
  sentAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
})
export type AdminWebmentionOutboxWire = z.infer<typeof adminWebmentionOutboxDto>
