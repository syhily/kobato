import {
  newsletterConfirmSchema,
  newsletterOkOutputSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@kobato/api/contracts/account/newsletter'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const newsletterContract = {
  subscribe: defineProcedure({ method: 'POST', path: '/newsletter/subscribe' })
    .input(newsletterSubscribeSchema)
    .output(newsletterOkOutputSchema),
  confirm: defineProcedure({ method: 'POST', path: '/newsletter/confirm' })
    .input(newsletterConfirmSchema)
    .output(newsletterOkOutputSchema),
  unsubscribe: defineProcedure({ method: 'POST', path: '/newsletter/unsubscribe' })
    .input(newsletterUnsubscribeSchema)
    .output(newsletterOkOutputSchema),
}
