import { idString, isoDateTime } from '@kobato/api/contracts/primitives'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { z } from 'zod'

export const WEBMENTION_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const

export const WEBMENTION_VERIFY_STATUSES = ['verified', 'failed'] as const

export const WEBMENTION_TYPES = ['mention', 'reply', 'like', 'repost'] as const

export const WEBMENTION_OUTBOX_STATUSES = ['pending', 'sent', 'no-endpoint', 'failed'] as const

export const adminWebmentionDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  targetUrl: z.string(),
  targetType: z.enum(['post', 'page']),
  status: z.enum(WEBMENTION_STATUSES),
  type: z.enum(WEBMENTION_TYPES),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  verificationStatus: z.enum(WEBMENTION_VERIFY_STATUSES),
  lastVerifiedAt: isoDateTime.nullable(),
  lastError: z.string().nullable(),
  verifyFailStreak: z.number().int(),
  createdAt: isoDateTime,
})
export type AdminWebmentionWire = z.infer<typeof adminWebmentionDto>

export const adminWebmentionOutboxDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  targetUrl: z.string(),
  endpoint: z.string().nullable(),
  status: z.enum(WEBMENTION_OUTBOX_STATUSES),
  attempts: z.number().int(),
  nextRetryAt: isoDateTime.nullable(),
  lastError: z.string().nullable(),
  sentAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
})
export type AdminWebmentionOutboxWire = z.infer<typeof adminWebmentionOutboxDto>

export const publicWebmentionDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  type: z.enum(WEBMENTION_TYPES),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  createdAt: isoDateTime,
})
export type PublicWebmentionWire = z.infer<typeof publicWebmentionDto>

function statusCountFields<T extends readonly string[]>(statuses: T): { [K in T[number]]: z.ZodNumber } {
  return unsafeCast(Object.fromEntries(statuses.map((status) => [status, z.number().int()])))
}

export const webmentionStatusCountsSchema = z.object({
  all: z.number().int(),
  ...statusCountFields(WEBMENTION_STATUSES),
})
export type WebmentionStatusCounts = z.infer<typeof webmentionStatusCountsSchema>

export const webmentionOutboxStatusCountsSchema = z.object({
  all: z.number().int(),
  ...statusCountFields(WEBMENTION_OUTBOX_STATUSES),
})
export type WebmentionOutboxStatusCounts = z.infer<typeof webmentionOutboxStatusCountsSchema>

export const adminWebmentionListSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  status: z.enum(['all', ...WEBMENTION_STATUSES]).optional(),
})
export type AdminWebmentionListInput = z.infer<typeof adminWebmentionListSchema>

export const adminWebmentionOutboxListSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  status: z.enum(['all', ...WEBMENTION_OUTBOX_STATUSES]).optional(),
})
export type AdminWebmentionOutboxListInput = z.infer<typeof adminWebmentionOutboxListSchema>

export const adminWebmentionIdInput = z.object({ id: z.string() })
export type AdminWebmentionIdInput = z.infer<typeof adminWebmentionIdInput>

export const adminWebmentionsLoadAllOutputDto = z.object({
  mentions: z.array(adminWebmentionDto),
  total: z.number().int(),
  hasMore: z.boolean(),
  statusCounts: webmentionStatusCountsSchema,
})
export type AdminWebmentionsLoadAllOutput = z.infer<typeof adminWebmentionsLoadAllOutputDto>

export const adminWebmentionOutboxOutputDto = z.object({
  rows: z.array(adminWebmentionOutboxDto),
  total: z.number().int(),
  hasMore: z.boolean(),
  statusCounts: webmentionOutboxStatusCountsSchema,
})
export type AdminWebmentionOutboxOutput = z.infer<typeof adminWebmentionOutboxOutputDto>

export const webmentionPublicListSchema = z.object({ page_key: z.string() })

export const webmentionPublicListOutputSchema = z.object({ webmentions: z.array(publicWebmentionDto) })
export type WebmentionPublicListOutput = z.infer<typeof webmentionPublicListOutputSchema>

export const adminWebmentionsPendingCountOutputSchema = z.number().int().nonnegative()
