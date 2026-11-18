import { webmentionsContract } from '@kobato/api/webmentions.ts'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { loadPublicWebmentionsForTarget } from '@kobato/server/domains/webmentions/service.ts'
import { implementPublic } from '@kobato/server/http/orpc-base.ts'

// Contract-first: method/path/input/output live in `@kobato/api/webmentions.ts`;
// this controller only implements the procedures.

// Headless surface for the「引用与回应」block: `page_key` resolves through
// `resolveMetricTarget` (miss → NOT_FOUND); the double display gate lives in
// the domain and answers an empty array when off.
const list = implementPublic(webmentionsContract).list.handler(async ({ input, context }) => {
  const target = await resolveMetricTarget(context.db, input.page_key)
  const webmentions = await loadPublicWebmentionsForTarget(context.db, target)
  return { webmentions }
})

export const webmentionPublicRouter = implementPublic(webmentionsContract).router({
  list,
})
