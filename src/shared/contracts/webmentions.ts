import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

// Canonical webmention value lists — the single source for the drizzle
// `text({ enum })` columns, the SQL CHECK literals
// (src/server/infra/db/schema/webmention.ts), and every zod enum below and
// in src/server/domains/webmentions/schema.ts. Order is load-bearing: the
// CHECK literals are generated from these arrays and must stay byte-identical.

// Webmention moderation lifecycle: `pending` rows await admin review;
// `rejected` rows are kept (auditable). `hidden` follows 7 consecutive
// daily re-verification failures — only a manual re-verification restores `approved`.
export const WEBMENTION_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const

// Webmention source verification state: `failed` carries the last failure message in `last_error`.
export const WEBMENTION_VERIFY_STATUSES = ['verified', 'failed'] as const

// Webmention response type (W3C / IndieWeb mf2 classification —
// docs/plans/2026-08-02-webmention-async-inbox-design.md): detected from
// `u-in-reply-to` / `u-repost-of` / `u-like-of` markers, no marker = `mention`;
// presentational grouping only, moderation and verification treat all types alike.
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

// Public display DTO (approved mentions): deliberately narrow —
// internal fields never leave the server. `type` crosses: the public
// block groups replies/likes/reposts by it.
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
