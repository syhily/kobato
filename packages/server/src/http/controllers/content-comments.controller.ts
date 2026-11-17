import { contentCommentsByKeyInputSchema, contentCommentsByKeyOutputSchema } from '@kobato/contracts/content.ts'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { loadCommentsAndItems } from '@kobato/server/http/loaders/comments.ts'
import { publicProc } from '@kobato/server/http/orpc-base.ts'

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
