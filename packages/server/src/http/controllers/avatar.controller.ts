import { avatarContract } from '@kobato/api/avatar.ts'
import { avatarImageUrl } from '@kobato/assets/avatar.ts'
import { resolveAvatarForEmail } from '@kobato/server/domains/comments/services/avatar.ts'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { joinUrl } from '@kobato/utils/urls.ts'

// Contract-first: method/path/input/output live in `@kobato/api/avatar.ts`;
// this controller only implements the procedures. The limiter rides the
// implementer so it runs BEFORE the contract's input validation.
const impl = implementPublic(avatarContract).use(resourceRateLimit)

const findAvatar = impl.find.handler(async ({ input }) => {
  const hash = await resolveAvatarForEmail(input.email)
  return {
    avatar: joinUrl(requireBlogSettingsSection('siteIdentity').website, avatarImageUrl(hash)),
  }
})

export const avatarRouter = impl.router({
  find: findAvatar,
})
