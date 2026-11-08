import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { honeypotField } from '@/shared/utils/schema'

// Typed catalog id (never prose): the boundary maps it into a wire descriptor.
const newsletterValidationMessages = {
  invalidId: 'newsletter.error.invalidId',
} as const satisfies Record<string, UiMessageId>

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
  id: z.string().regex(/^\d+$/, { message: newsletterValidationMessages.invalidId }),
  sig: z.string().min(1).max(128),
})
export type NewsletterUnsubscribeInput = z.infer<typeof newsletterUnsubscribeSchema>
