import { z } from 'zod'

import { WEBMENTION_OUTBOX_STATUSES, WEBMENTION_STATUSES } from '@/shared/contracts/webmentions'

// W3C receive payload — form-encoded `source` + `target`; the caps stop a
// junk POST from smuggling a large body into the parser (the route also caps content-length).
const MAX_URL_LENGTH = 2048

const httpUrlField = (name: string) =>
  z
    .string()
    .min(1, { message: `${name} is required` })
    .max(MAX_URL_LENGTH)
    .refine(
      (value) => {
        try {
          const url = new URL(value)
          return url.protocol === 'http:' || url.protocol === 'https:'
        } catch {
          return false
        }
      },
      { message: `${name} must be a valid http(s) URL` },
    )

export const webmentionReceiveSchema = z.object({
  source: httpUrlField('source'),
  target: httpUrlField('target'),
})
export type WebmentionReceiveInput = z.infer<typeof webmentionReceiveSchema>

// Public display list (headless API, `public.webmention.list`) — keyed by
// `page_key` (same flow as `public.comments.list`, split-plan notes-6 §3.1);
// a miss resolves to NOT_FOUND.
export const webmentionPublicListSchema = z.object({
  page_key: z.string(),
})

// Admin moderation list — `rejected` is a stored terminal state (not a
// delete); `hidden` follows 7 consecutive daily re-verification failures.
export const adminWebmentionListSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  status: z.enum(['all', ...WEBMENTION_STATUSES]).optional(),
})

// Outbound send-log list — read-only; `all` carries no status constraint.
export const adminWebmentionOutboxListSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  status: z.enum(['all', ...WEBMENTION_OUTBOX_STATUSES]).optional(),
})
