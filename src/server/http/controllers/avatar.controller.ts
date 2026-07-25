import { z } from 'zod'

import { fetchQQAvatarImage, isQQEmail } from '@/server/domains/comments/services/avatar'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { AvatarStatus, cacheAvatar } from '@/server/http/resources/avatar-cache'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { avatarImageUrl, DEFAULT_AVATAR_SIZE } from '@/shared/utils/avatar'
import { encodedEmail } from '@/shared/utils/security'
import { joinUrl } from '@/shared/utils/urls'

const findAvatar = publicProc
  .route({ method: 'GET', path: '/avatar/find' })
  .input(z.object({ email: z.email() }))
  .output(z.object({ avatar: z.string() }))
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    const hash = await encodedEmail(input.email)
    if (isQQEmail(input.email)) {
      // Pre-warm the cache at the default display size — the URL returned
      // below carries no explicit `?s=`, so the endpoint will serve (and
      // read) the DEFAULT_AVATAR_SIZE entry.
      const buffer = await fetchQQAvatarImage(input.email, DEFAULT_AVATAR_SIZE)
      if (buffer !== null) {
        await cacheAvatar(context.db, {
          email: hash,
          size: DEFAULT_AVATAR_SIZE,
          status: AvatarStatus.HAVE_AVATAR,
          buffer,
        })
      } else {
        await cacheAvatar(context.db, { email: hash, size: DEFAULT_AVATAR_SIZE, status: AvatarStatus.NO_AVATAR })
      }
    }
    return {
      avatar: joinUrl(requireBlogSettingsSection('siteIdentity').website, avatarImageUrl(hash)),
    }
  })

export const avatarRouter = {
  find: findAvatar,
}
