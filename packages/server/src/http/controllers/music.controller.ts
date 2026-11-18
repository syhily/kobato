import { musicContract } from '@kobato/api/music.ts'
import { getMusicMetaForPlayer } from '@kobato/server/domains/music/services/read.ts'
import { implementPublic, localizedOrpcError, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'

// Contract-first: method/path/input/output live in `@kobato/api/music.ts`;
// this controller only implements the procedures. The limiter rides the
// implementer so it runs BEFORE the contract's input validation.
const impl = implementPublic(musicContract).use(resourceRateLimit)

const get = impl.get.handler(async ({ input, context }) => {
  const meta = await getMusicMetaForPlayer(context.db, input.id)
  if (meta === null) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'music.error.notFoundOrOffline')
  }
  return { music: meta }
})

export const musicRouter = impl.router({
  get,
})
