import { contentCommentsContract } from '@kobato/api/content.ts'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { loadCommentsAndItems } from '@kobato/server/http/loaders/comments.ts'
import { implementPublic } from '@kobato/server/http/orpc-base.ts'

export const contentCommentsByKey = implementPublic(contentCommentsContract).byKey.handler(
  async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.pageKey)
    return loadCommentsAndItems(context.db, context.session, target)
  },
)
