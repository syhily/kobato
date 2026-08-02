import { z } from 'zod'

import { resolveMetricTarget } from '@/server/domains/comments/services/shared'
import { webmentionPublicListSchema } from '@/server/domains/webmentions/schema'
import { loadPublicWebmentionsForTarget } from '@/server/domains/webmentions/service'
import { publicProc } from '@/server/http/orpc-base'
import { publicWebmentionDto } from '@/shared/contracts/webmentions'

// The headless public surface for the「引用与回应」block
// (split-plan notes-6 §3.1). Input is the metric `public_id` — the same
// `page_key` flow as `public.comments.list`, resolved through the
// comments-owned `resolveMetricTarget` (a miss is NOT_FOUND, identical
// semantics). The double display gate (global `displayOnPosts` + the
// per-entity meta toggle) lives in the domain's
// `loadPublicWebmentionsForTarget` and answers an honest empty array
// when off. No pagination: the current SSR feed is all approved rows.
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
