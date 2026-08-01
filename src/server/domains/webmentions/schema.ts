import { z } from 'zod'

// W3C Webmention receive payload — the protocol mandates a form-encoded
// POST with `source` + `target` URL parameters. Both are capped well
// above any sane URL length so a junk POST cannot smuggle a large body
// into the parser (the resource route also caps content-length).
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

// Admin moderation list — mirrors the comments status-enum pattern,
// extended with `rejected` (webmention rejection is a stored terminal
// state, not a delete).
export const adminWebmentionListSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  status: z.enum(['all', 'pending', 'approved', 'rejected']).optional(),
})
export type AdminWebmentionListInput = z.infer<typeof adminWebmentionListSchema>

// Outbound send-log list — read-only; the `all` filter carries no status
// constraint, same convention as the moderation list above.
export const adminWebmentionOutboxListSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  status: z.enum(['all', 'pending', 'sent', 'no-endpoint', 'failed']).optional(),
})
export type AdminWebmentionOutboxListInput = z.infer<typeof adminWebmentionOutboxListSchema>
