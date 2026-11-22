import { avatarContract } from '@kobato/api/rpc/public/avatar'
import { avatarImageUrl } from '@kobato/assets/avatar'
import { resolveAvatarForEmail } from '@kobato/server/domains/comments/services/avatar'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base'

const impl = implementPublic(avatarContract).use(resourceRateLimit)

const findAvatar = impl.find.handler(async ({ input }) => {
  const hash = await resolveAvatarForEmail(input.email)
  return { avatar: avatarImageUrl(hash) }
})

export const avatarRouter = impl.router({
  find: findAvatar,
})
