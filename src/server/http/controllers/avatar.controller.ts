import { z } from 'zod'

import { resolveAvatarForEmail } from '@/server/domains/comments/services/avatar'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { joinUrl } from '@/shared/utils/urls'

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
