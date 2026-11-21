import { z } from 'zod'

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
