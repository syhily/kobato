import { z } from 'zod'

import { honeypotField } from '@/shared/utils/schema'

const newsletterHoneypot = honeypotField('subtitle')

// Same field name as the comment-submit honeypot.
export const newsletterSubscribeSchema = z
  .object({
    email: z.email(),
    /** Leave blank — used for bot filtering only; stripped before `subscribe`. */
    subtitle: newsletterHoneypot.schema,
  })
  .superRefine(newsletterHoneypot.refine)
export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>

export const newsletterConfirmSchema = z.object({
  token: z.string().min(1).max(128),
})
export type NewsletterConfirmInput = z.infer<typeof newsletterConfirmSchema>

// `id` arrives stringified — bigint ids never cross the JSON boundary. `sig`
// is the HMAC-SHA256 hex signature from the unsubscribe link.
export const newsletterUnsubscribeSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: '订阅 ID 必须是数字' }),
  sig: z.string().min(1).max(128),
})
export type NewsletterUnsubscribeInput = z.infer<typeof newsletterUnsubscribeSchema>
