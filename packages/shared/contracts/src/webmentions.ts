import { idString, isoDateTime } from '@kobato/contracts/primitives.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { z } from 'zod'

// Canonical webmention value lists for the WIRE — every zod enum below and in
// `packages/server/src/domains/webmentions/schema.ts`. The persistence twins
// (the drizzle `text({ enum })` columns and the SQL CHECK literals) live in
// `packages/db/src/schema/webmention.ts`; the lists must stay value- and
// order-identical, pinned by
// `packages/server/tests/unit/server/infra/db/wire-parity.test.ts`.

// Webmention moderation lifecycle: `pending` rows await admin review;
// `rejected` rows are kept (auditable). `hidden` follows 7 consecutive
// daily re-verification failures — only a manual re-verification restores `approved`.
export const WEBMENTION_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const

// Webmention source verification state: `failed` carries the last failure message in `last_error`.
export const WEBMENTION_VERIFY_STATUSES = ['verified', 'failed'] as const

// Webmention response type (W3C / IndieWeb mf2 classification): detected from
// `u-in-reply-to` / `u-repost-of` / `u-like-of` markers, no marker = `mention`;
// presentational grouping only — moderation and verification treat all types alike.
export const WEBMENTION_TYPES = ['mention', 'reply', 'like', 'repost'] as const

// Webmention send lifecycle: `sent` / `no-endpoint` / `failed` are terminal and kept (the row IS the send log);
// a republish resets `no-endpoint` / `failed` back to `pending`, but never `sent`.
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

// Outbound mirror: the send log row, read-only in the admin shell.
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

// Public display DTO (approved mentions): deliberately narrow — internal fields
// never leave the server. `type` crosses: the public block groups by it.
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

// Status-count envelopes for the admin list outputs: `all` plus one entry per
// lifecycle status, derived from the canonical lists so a new status cannot
// drift between the SQL GROUP BY and the wire schema.
function statusCountFields<T extends readonly string[]>(statuses: T): { [K in T[number]]: z.ZodNumber } {
  // Safe: every entry of `statuses` becomes exactly one key, so the shape covers precisely `T[number]`.
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

// Admin moderation wire inputs — moved from the server webmentions domain so
// the `@kobato/api` contract composes the same schema objects the server
// validates against.

// Admin moderation list — `rejected` is a stored terminal state (not a
// delete); `hidden` follows 7 consecutive daily re-verification failures.
export const adminWebmentionListSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  status: z.enum(['all', ...WEBMENTION_STATUSES]).optional(),
})
export type AdminWebmentionListInput = z.infer<typeof adminWebmentionListSchema>

// Outbound send-log list — read-only; `all` carries no status constraint.
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

// Public display list (`webmention.list`) — keyed by `page_key` (same flow as
// `comments/list`); a miss resolves to NOT_FOUND, an off gate to an empty array.
export const webmentionPublicListSchema = z.object({ page_key: z.string() })

export const webmentionPublicListOutputSchema = z.object({ webmentions: z.array(publicWebmentionDto) })
export type WebmentionPublicListOutput = z.infer<typeof webmentionPublicListOutputSchema>
