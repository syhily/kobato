import { feedOutputSchema, feedScopeInputSchema } from '@kobato/api/contracts/public/feeds'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const feedsContract = {
  rss: defineProcedure({ method: 'GET', path: '/feeds/rss' }, { publicRead: true })
    .input(feedScopeInputSchema)
    .output(feedOutputSchema),
  atom: defineProcedure({ method: 'GET', path: '/feeds/atom' }, { publicRead: true })
    .input(feedScopeInputSchema)
    .output(feedOutputSchema),
}
