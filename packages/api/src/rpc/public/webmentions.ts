import {
  webmentionPublicListOutputSchema,
  webmentionPublicListSchema,
  webmentionReceiveInputSchema,
  webmentionReceiveOutputSchema,
} from '@kobato/api/contracts/public/webmentions'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const webmentionsContract = {
  list: defineProcedure({ method: 'GET', path: '/webmention/list' }, { publicRead: true })
    .input(webmentionPublicListSchema)
    .output(webmentionPublicListOutputSchema),
  receive: defineProcedure({ method: 'POST', path: '/webmention' }, { csrfExempt: true, installGateExempt: true })
    .input(webmentionReceiveInputSchema)
    .output(webmentionReceiveOutputSchema),
}
