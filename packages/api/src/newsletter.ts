import {
  newsletterConfirmSchema,
  newsletterOkOutputSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@kobato/contracts/newsletter.ts'
import { oc } from '@orpc/contract'

// The newsletter RPC contract — anonymous subscribe/confirm/unsubscribe.
export const newsletterContract = {
  subscribe: oc
    .route({ method: 'POST', path: '/newsletter/subscribe' })
    .input(newsletterSubscribeSchema)
    .output(newsletterOkOutputSchema),
  confirm: oc
    .route({ method: 'POST', path: '/newsletter/confirm' })
    .input(newsletterConfirmSchema)
    .output(newsletterOkOutputSchema),
  unsubscribe: oc
    .route({ method: 'POST', path: '/newsletter/unsubscribe' })
    .input(newsletterUnsubscribeSchema)
    .output(newsletterOkOutputSchema),
}
