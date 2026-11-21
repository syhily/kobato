import { friendsContract } from '@kobato/api/friends'
import { applyFriend } from '@kobato/server/domains/friends/service'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base'

const impl = implementPublic(friendsContract).use(resourceRateLimit)

const apply = impl.apply.handler(async ({ input, context }) => {
  await applyFriend(context.db, {
    website: input.website,
    homepage: input.homepage,
    description: input.description,
    poster: input.poster,
    rssUrl: input.rssUrl,
  })
  return { ok: true as const }
})

export const friendsPublicRouter = impl.router({
  apply,
})
