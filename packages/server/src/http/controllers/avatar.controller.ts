import { resolveAvatarForEmail } from '@kobato/server/domains/comments/services/avatar.ts'
import { publicProc, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { avatarImageUrl } from '@kobato/utils/avatar.ts'
import { joinUrl } from '@kobato/utils/urls.ts'
import { z } from 'zod'

const findAvatar = publicProc
  .route({ method: 'GET', path: '/avatar/find' })
  // Limiter before `.input(...)`: oRPC validates input at its declared
  // index, so a trailing middleware never sees a malformed payload.
  .use(resourceRateLimit)
  .input(z.object({ email: z.email() }))
  .output(z.object({ avatar: z.string() }))
  .handler(async ({ input }) => {
    const hash = await resolveAvatarForEmail(input.email)
    return {
      avatar: joinUrl(requireBlogSettingsSection('siteIdentity').website, avatarImageUrl(hash)),
    }
  })

export const avatarRouter = {
  find: findAvatar,
}
