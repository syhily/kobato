import { friendsContract } from '@kobato/api/friends.ts'
import { applyFriend } from '@kobato/server/domains/friends/service.ts'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'

// Contract-first: method/path/input/output live in `@kobato/api/friends.ts`;
// this controller only implements the procedures. The limiter rides the
// implementer so it runs BEFORE the contract's input validation (honeypot
// bodies are capped, but the bucket is consulted before any parsing).
const impl = implementPublic(friendsContract).use(resourceRateLimit)

// Visitor-facing friend-link application — honeypot + per-IP rate limit
// mirror the comment submit path; rows land pending and notify the admin.
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
