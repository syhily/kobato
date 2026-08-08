import { z } from 'zod'

import { applyFriendSchema } from '@/server/domains/friends/schema'
import { applyFriend } from '@/server/domains/friends/service'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'

// Visitor-facing friend-link application — honeypot + per-IP rate limit
// mirror the comment submit path; rows land pending and notify the admin.
const apply = publicProc
  .route({ method: 'POST', path: '/friends/apply' })
  .input(applyFriendSchema)
  .output(z.object({ ok: z.literal(true) }))
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
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
