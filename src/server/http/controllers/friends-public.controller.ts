import { z } from 'zod'

import { applyFriendSchema } from '@/server/domains/friends/schema'
import { applyFriend } from '@/server/domains/friends/service'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'

// Visitor-facing friend-link application. Defenses mirror the comment
// submit path: a honeypot inside the input schema (`contact`) plus the
// shared per-IP resource rate limit. The service inserts the row as
// `visible: false` (pending) and notifies the admin.
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
