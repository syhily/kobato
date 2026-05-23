import { z } from 'zod'

import { publicProc } from '@/server/http/orpc-base'
import { findUserIdByEmail } from '@/server/infra/db/operations/user'
import { AvatarStatus, cacheAvatar } from '@/server/render/avatar/cache'
import { fetchQQAvatarImage, isQQEmail } from '@/server/render/avatar/fetch'
import { requireBlogSettingsSection } from '@/shared/config/blog'
import { encodedEmail } from '@/shared/utils/security'
import { joinUrl } from '@/shared/utils/urls'

const findAvatar = publicProc
  .route({ method: 'GET', path: '/avatar/find' })
  .input(z.object({ email: z.email() }))
  .output(z.object({ avatar: z.string() }))
  .handler(async ({ input }) => {
    const id = await findUserIdByEmail(input.email)
    const hash = id === null ? await encodedEmail(input.email) : id
    if (isQQEmail(input.email)) {
      const canonicalHash = await encodedEmail(input.email)
      const buffer = await fetchQQAvatarImage(input.email)
      if (buffer !== null) {
        await cacheAvatar({ email: canonicalHash, status: AvatarStatus.HAVE_AVATAR, buffer })
      } else {
        await cacheAvatar({ email: canonicalHash, status: AvatarStatus.NO_AVATAR })
      }
    }
    return {
      avatar: joinUrl(requireBlogSettingsSection('siteIdentity').website, 'images/avatar', `${hash}.png`),
    }
  })

export const avatarRouter = {
  find: findAvatar,
}
