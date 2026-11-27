import type { ResourceRedirect } from '@kobato/api/contracts/primitives'
import type { AvatarImageInput, AvatarImageOutput } from '@kobato/api/contracts/public/avatar'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { avatarContract } from '@kobato/api/rpc/public/avatar'
import { avatarImageUrl } from '@kobato/base/assets/avatar'
import {
  defaultAvatarPath,
  resolveAvatarForEmail,
  resolveAvatarSize,
  serveAvatar,
} from '@kobato/server/domains/comments/services/avatar'
import { implementPublic, localizedOrpcError, rateLimitByIp, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { tryKeyedRateLimit } from '@kobato/server/infra/rate-limit'

const impl = implementPublic(avatarContract)

const AVATAR_CACHE_CONTROL = 'public, max-age=604800'

const AVATAR_IP_RATE_BUCKET = { windowSeconds: 60, maxAttempts: 3000 }
const AVATAR_RATE_BUCKET = { windowSeconds: 1, maxAttempts: 5 }

function avatarRedirect(): ResourceRedirect {
  return { kind: 'redirect', location: defaultAvatarPath(), cacheControl: null }
}

const findAvatar = impl.find.use(resourceRateLimit).handler(async ({ input }) => {
  const hash = await resolveAvatarForEmail(input.email)
  return { avatar: avatarImageUrl(hash) }
})

async function avatarImageAnswer(input: AvatarImageInput, context: HandlerContext): Promise<AvatarImageOutput> {
  const { exceeded } = await tryKeyedRateLimit(`rate-limit:avatar:${input.hash.toLowerCase()}`, AVATAR_RATE_BUCKET)
  if (exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'error.api.rateLimited')
  }
  if (input.hash === '') {
    return avatarRedirect()
  }
  const avatar = await serveAvatar(context.db, input.hash, resolveAvatarSize(input.size))
  if (avatar.kind === 'redirect') {
    return avatarRedirect()
  }
  return {
    kind: 'ok',
    body: new Blob([new Uint8Array(avatar.buffer)], { type: 'image/png' }),
    contentType: 'image/png',
    cacheControl: AVATAR_CACHE_CONTROL,
    contentLanguage: null,
  }
}

const image = impl.image
  .use(rateLimitByIp('avatar-ip', AVATAR_IP_RATE_BUCKET))
  .handler(async ({ input, context }) => avatarImageAnswer(input, context))

export const avatarRouter = impl.router({
  find: findAvatar,
  image,
})
