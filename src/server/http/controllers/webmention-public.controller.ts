import { z } from 'zod'

import { resolveMetricTarget } from '@/server/domains/comments/services/shared'
import { webmentionPublicListSchema } from '@/server/domains/webmentions/schema'
import { loadPublicWebmentionsForTarget } from '@/server/domains/webmentions/service'
import { publicProc } from '@/server/http/orpc-base'
import { publicWebmentionDto } from '@/shared/contracts/webmentions'

// Headless surface for the「引用与回应」block (split-plan notes-6 §3.1):
// `page_key` resolves through `resolveMetricTarget` (miss → NOT_FOUND); the
// double display gate lives in the domain and answers an empty array when off.
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
