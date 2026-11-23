import { webmentionPublicListOutputSchema, webmentionPublicListSchema } from '@kobato/api/contracts/public/webmentions'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const webmentionsContract = {
  list: defineProcedure({ method: 'GET', path: '/webmention/list' }, { publicRead: true })
    .input(webmentionPublicListSchema)
    .output(webmentionPublicListOutputSchema),
}
