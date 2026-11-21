import { webmentionPublicListOutputSchema, webmentionPublicListSchema } from '@kobato/contracts/webmentions'
import { oc } from '@orpc/contract'

export const webmentionsContract = {
  list: oc
    .route({ method: 'GET', path: '/webmention/list' })
    .input(webmentionPublicListSchema)
    .output(webmentionPublicListOutputSchema),
}
