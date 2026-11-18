import { contentCommentsContract } from '@kobato/api/content.ts'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { loadCommentsAndItems } from '@kobato/server/http/loaders/comments.ts'
import { implementPublic } from '@kobato/server/http/orpc-base.ts'

// Contract-first: method/path/input/output live in `@kobato/api/content.ts`;
// this controller only implements the procedures.

// The streamed comments payload: `pageKey` resolves through
// `resolveMetricTarget` (NOT_FOUND semantics like `webmention.list`).
export const contentCommentsByKey = implementPublic(contentCommentsContract).byKey.handler(
  async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.pageKey)
    return loadCommentsAndItems(context.db, context.session, target)
  },
)
