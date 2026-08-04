import { idString, isoDateTime } from '@kobato/shared/contracts/primitives'
import { z } from 'zod'

export const adminWebmentionDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  targetUrl: z.string(),
  targetType: z.enum(['post', 'page']),
  status: z.enum(['pending', 'approved', 'rejected', 'hidden']),
  type: z.enum(['mention', 'reply', 'like', 'repost']),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  verificationStatus: z.enum(['verified', 'failed']),
  lastVerifiedAt: isoDateTime.nullable(),
  lastError: z.string().nullable(),
  verifyFailStreak: z.number().int(),
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

// Public display DTO (approved mentions under a post/page). Deliberately
// narrow — internal fields (targetOwnerId, rawPayload, status, fetchedAt,
// moderatedAt) never leave the server. `type` crosses the boundary: the
// public block groups replies/likes/reposts by it.
export const publicWebmentionDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  type: z.enum(['mention', 'reply', 'like', 'repost']),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  createdAt: isoDateTime,
})
export type PublicWebmentionWire = z.infer<typeof publicWebmentionDto>
