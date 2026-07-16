import { z } from 'zod'

/** Honeypot field: must stay empty (bots often fill every text input). */
const NEWSLETTER_HONEYPOT_MAX_LEN = 240

// Mirrors the comment-submit honeypot (`subtitle` must stay blank).
export const newsletterSubscribeSchema = z
  .object({
    email: z.email(),
    /** Leave blank — used for bot filtering only; stripped before `subscribe`. */
    subtitle: z.string().max(NEWSLETTER_HONEYPOT_MAX_LEN).optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (val.subtitle.trim().length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: '输入数据无效。',
        path: ['subtitle'],
      })
    }
  })
export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>

export const newsletterConfirmSchema = z.object({
  token: z.string().min(1).max(128),
})
export type NewsletterConfirmInput = z.infer<typeof newsletterConfirmSchema>

// `id` arrives as a string on the wire (bigint ids never cross the JSON
// boundary); `sig` is the HMAC-SHA256 hex signature from the unsubscribe
// link. Length caps keep junk payloads out of the signature check.
export const newsletterUnsubscribeSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: '订阅 ID 必须是数字' }),
  sig: z.string().min(1).max(128),
})
export type NewsletterUnsubscribeInput = z.infer<typeof newsletterUnsubscribeSchema>
