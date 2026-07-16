import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { applyFriendSchema } from '@/server/domains/friends/schema'
import { applyFriend } from '@/server/domains/friends/service'
import { publicProc } from '@/server/http/orpc-base'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'

// Visitor-facing friend-link application. Defenses mirror the comment
// submit path: a honeypot inside the input schema (`contact`) plus the
// shared per-IP resource rate limit. The service inserts the row as
// `visible: false` (pending) and notifies the admin.
const apply = publicProc
  .route({ method: 'POST', path: '/friends/apply' })
  .input(applyFriendSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    const rateLimit = await tryResourceRateLimit(context.clientAddress)
    if (rateLimit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '请求过于频繁，请稍后再试。' })
    }
    await applyFriend(context.db, {
      website: input.website,
      homepage: input.homepage,
      description: input.description,
      poster: input.poster,
      rssUrl: input.rssUrl,
    })
    return { ok: true as const }
  })

export const friendsPublicRouter = { apply }
