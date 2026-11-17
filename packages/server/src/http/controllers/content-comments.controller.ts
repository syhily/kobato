import { contentCommentsByKeyInputSchema, contentCommentsByKeyOutputSchema } from '@kobato/shared/contracts/content.ts'

import { resolveMetricTarget } from '../../domains/comments/services/shared'
import { loadCommentsAndItems } from '../loaders/comments'
import { publicProc } from '../orpc-base'

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
