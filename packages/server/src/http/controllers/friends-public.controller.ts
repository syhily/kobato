import { applyFriendSchema } from '@kobato/server/domains/friends/schema'
import { applyFriend } from '@kobato/server/domains/friends/service'
import { frontendKeyAuth, publicProc, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { z } from 'zod'

// Visitor-facing friend-link application. Defenses mirror the comment
// submit path: a honeypot inside the input schema (`contact`) plus the
// shared per-IP resource rate limit. `frontendKeyAuth` runs first so the
// proxy-supplied visitor address (X-Forwarded-For, honored only behind a
// valid frontend JWT) feeds the per-IP bucket instead of the frontend's
// own address — same trust chain as the comment submit path. The service
// inserts the row as `visible: false` (pending) and notifies the admin.
const apply = publicProc
  .route({ method: 'POST', path: '/content/v1/friends/apply' })
  .input(applyFriendSchema)
  .output(z.object({ ok: z.literal(true) }))
  .use(frontendKeyAuth)
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
