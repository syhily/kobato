import { publicWebmentionDto } from '@kobato/contracts/webmentions.ts'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { webmentionPublicListSchema } from '@kobato/server/domains/webmentions/schema.ts'
import { loadPublicWebmentionsForTarget } from '@kobato/server/domains/webmentions/service.ts'
import { publicProc } from '@kobato/server/http/orpc-base.ts'
import { z } from 'zod'

// Headless surface for the「引用与回应」block: `page_key` resolves through
// `resolveMetricTarget` (miss → NOT_FOUND); the double display gate lives in
// the domain and answers an empty array when off.
const list = publicProc
  .route({ method: 'GET', path: '/webmention/list' })
  .input(webmentionPublicListSchema)
  .output(z.object({ webmentions: z.array(publicWebmentionDto) }))
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.page_key)
    const webmentions = await loadPublicWebmentionsForTarget(context.db, target)
    return { webmentions }
  })

export const webmentionPublicRouter = {
  list,
}
