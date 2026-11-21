import { contentCommentsContract } from '@kobato/api/content'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared'
import { loadCommentsAndItems } from '@kobato/server/http/loaders/comments'
import { implementPublic } from '@kobato/server/http/orpc-base'

export const contentCommentsByKey = implementPublic(contentCommentsContract).byKey.handler(
  async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.pageKey)
    return loadCommentsAndItems(context.db, context.session, target)
  },
)
