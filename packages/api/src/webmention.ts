import { webmentionPublicListOutputSchema, webmentionPublicListSchema } from '@kobato/contracts/webmentions.ts'
import { oc } from '@orpc/contract'

// The webmention RPC contract — the public「引用与回应」display list.
export const webmentionContract = {
  list: oc
    .route({ method: 'GET', path: '/webmention/list' })
    .input(webmentionPublicListSchema)
    .output(webmentionPublicListOutputSchema),
}
