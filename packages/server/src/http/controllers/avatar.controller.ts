import { resolveAvatarForEmail } from '@kobato/server/domains/comments/services/avatar'
import { publicProc, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { avatarImageUrl } from '@kobato/shared/utils/avatar'
import { joinUrl } from '@kobato/shared/utils/urls'
import { z } from 'zod'

const findAvatar = publicProc
  .route({ method: 'GET', path: '/avatar/find' })
  .input(z.object({ email: z.email() }))
  .output(z.object({ avatar: z.string() }))
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    const hash = await resolveAvatarForEmail(context.db, input.email)
    return {
      avatar: joinUrl(requireBlogSettingsSection('siteIdentity').website, avatarImageUrl(hash)),
    }
  })

export const avatarRouter = {
  find: findAvatar,
}
