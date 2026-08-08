import { resolveMetricTarget } from '@/server/domains/comments/services/shared'
import { loadCommentsAndItems } from '@/server/http/loaders/comments'
import { publicProc } from '@/server/http/orpc-base'
import { contentCommentsByKeyInputSchema, contentCommentsByKeyOutputSchema } from '@/shared/contracts/content'

// The streamed comments payload: `pageKey` resolves through
// `resolveMetricTarget` (NOT_FOUND semantics like `webmention.list`).
export const contentCommentsByKey = publicProc
  .route({ method: 'GET', path: '/content/comments/byKey' })
  .input(contentCommentsByKeyInputSchema)
  .output(contentCommentsByKeyOutputSchema)
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.pageKey)
    return loadCommentsAndItems(context.db, context.session, target)
  })
