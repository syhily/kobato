import { z } from 'zod'

import { findUserIdByEmail } from '@/server/domains/users/services/account'
import { publicProc } from '@/server/http/orpc-base'
import { AvatarStatus, cacheAvatar } from '@/server/http/resources/avatar-cache'
import { fetchQQAvatarImage, isQQEmail } from '@/server/render/avatar/fetch'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { encodedEmail } from '@/shared/utils/security'
import { joinUrl } from '@/shared/utils/urls'

const findAvatar = publicProc
  .route({ method: 'GET', path: '/avatar/find' })
  .input(z.object({ email: z.email() }))
  .output(z.object({ avatar: z.string() }))
  .handler(async ({ input, context }) => {
    const id = await findUserIdByEmail(context.db, input.email)
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
