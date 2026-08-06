import { resolveMetricTarget } from '@/server/domains/comments/services/shared'
import { loadCommentsAndItems } from '@/server/http/loaders/comments'
import { publicProc } from '@/server/http/orpc-base'
import { contentCommentsByKeyInputSchema, contentCommentsByKeyOutputSchema } from '@/shared/contracts/content'

// The streamed comments payload for the public detail pages. `pageKey` is
// the metric public id carried by the detail critical (`commentKey`),
// resolved through the comments-owned `resolveMetricTarget` with the same
// NOT_FOUND semantics as `webmention.list`. The SSR detail loaders fire
// this call chained off the `bySlug` ok branch — never speculatively — so
// a 304/301/404 entity read costs zero comments work.
export const contentCommentsByKey = publicProc
  .route({ method: 'GET', path: '/content/comments/byKey' })
  .input(contentCommentsByKeyInputSchema)
  .output(contentCommentsByKeyOutputSchema)
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.pageKey)
    return loadCommentsAndItems(context.db, context.session, target)
  })
