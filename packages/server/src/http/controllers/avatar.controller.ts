import { avatarContract } from '@kobato/api/avatar.ts'
import { avatarImageUrl } from '@kobato/assets/avatar.ts'
import { resolveAvatarForEmail } from '@kobato/server/domains/comments/services/avatar.ts'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'

const impl = implementPublic(avatarContract).use(resourceRateLimit)

const findAvatar = impl.find.handler(async ({ input }) => {
  const hash = await resolveAvatarForEmail(input.email)
  return { avatar: avatarImageUrl(hash) }
})

export const avatarRouter = impl.router({
  find: findAvatar,
})
