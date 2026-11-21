import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { honeypotField, okDto } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

const newsletterValidationMessages = {
  invalidId: 'newsletter.error.invalidId',
} as const satisfies Record<string, UiMessageId>

const newsletterHoneypot = honeypotField('subtitle')

export const newsletterSubscribeSchema = z
  .object({
    email: z.email(),
    subtitle: newsletterHoneypot.schema,
  })
  .superRefine(newsletterHoneypot.refine)
export type NewsletterSubscribeInput = z.input<typeof newsletterSubscribeSchema>

export const newsletterConfirmSchema = z.object({
  token: z.string().min(1).max(128),
})
export type NewsletterConfirmInput = z.infer<typeof newsletterConfirmSchema>

export const newsletterUnsubscribeSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: newsletterValidationMessages.invalidId }),
  sig: z.string().min(1).max(128),
})
export type NewsletterUnsubscribeInput = z.infer<typeof newsletterUnsubscribeSchema>

export const newsletterOkOutputSchema = okDto
