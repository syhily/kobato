import { applyFriendSchema } from '@kobato/server/domains/friends/schema.ts'
import { applyFriend } from '@kobato/server/domains/friends/service.ts'
import { publicProc, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'
import { z } from 'zod'

// Visitor-facing friend-link application — honeypot + per-IP rate limit
// mirror the comment submit path; rows land pending and notify the admin.
const apply = publicProc
  .route({ method: 'POST', path: '/friends/apply' })
  // Limiter before `.input(...)`: oRPC validates input at its declared
  // index, so a trailing middleware never sees a malformed payload.
  .use(resourceRateLimit)
  .input(applyFriendSchema)
  .output(z.object({ ok: z.literal(true) }))
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
