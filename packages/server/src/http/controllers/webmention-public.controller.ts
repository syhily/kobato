import { webmentionsContract } from '@kobato/api/webmentions.ts'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { loadPublicWebmentionsForTarget } from '@kobato/server/domains/webmentions/service.ts'
import { implementPublic } from '@kobato/server/http/orpc-base.ts'

const list = implementPublic(webmentionsContract).list.handler(async ({ input, context }) => {
  const target = await resolveMetricTarget(context.db, input.page_key)
  const webmentions = await loadPublicWebmentionsForTarget(context.db, target)
  return { webmentions }
})

export const webmentionPublicRouter = implementPublic(webmentionsContract).router({
  list,
})
