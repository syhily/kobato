import { z } from 'zod'

// Admin moderation wire schemas (`adminWebmentionListSchema` /
// `adminWebmentionOutboxListSchema`) and the public list schema
// (`webmentionPublicListSchema`) live in `@kobato/contracts/webmentions.ts`;
// this module keeps the W3C receive surface.

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
