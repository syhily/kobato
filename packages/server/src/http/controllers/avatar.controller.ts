import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { avatarImageUrl } from '@kobato/shared/utils/avatar.ts'
import { joinUrl } from '@kobato/shared/utils/urls.ts'
import { z } from 'zod'

import { resolveAvatarForEmail } from '../../domains/comments/services/avatar'
import { publicProc, resourceRateLimit } from '../orpc-base'

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
