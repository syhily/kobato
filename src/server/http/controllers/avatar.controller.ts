import { z } from 'zod'

import { resolveAvatarForEmail } from '@/server/domains/comments/services/avatar'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { joinUrl } from '@/shared/utils/urls'

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
