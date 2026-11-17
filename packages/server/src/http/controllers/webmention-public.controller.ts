import { publicWebmentionDto } from '@kobato/shared/contracts/webmentions.ts'
import { z } from 'zod'

import { resolveMetricTarget } from '../../domains/comments/services/shared'
import { webmentionPublicListSchema } from '../../domains/webmentions/schema'
import { loadPublicWebmentionsForTarget } from '../../domains/webmentions/service'
import { publicProc } from '../orpc-base'

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
