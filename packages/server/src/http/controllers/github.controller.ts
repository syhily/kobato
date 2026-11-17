import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { fetchGithubAvatarDataUrl } from '../../domains/comments/services/avatar'
import { fetchLatestRelease } from '../../domains/update/release'
import { DomainError } from '../../infra/http/errors'
import { publicProc, resourceRateLimit } from '../orpc-base'

const avatar = publicProc
  .route({ method: 'GET', path: '/github/avatar' })
  .output(z.object({ avatar: z.string() }))
  .use(resourceRateLimit)
  .handler(async () => {
    // Fetch + base64 inlining lives in the comments domain; upstream failures resolve to ''.
    return { avatar: await fetchGithubAvatarDataUrl() }
  })

const release = publicProc
  .route({ method: 'GET', path: '/github/release' })
  .output(
    z.object({
      tagName: z.string(),
      htmlUrl: z.string(),
      name: z.string(),
      publishedAt: z.string(),
    }),
  )
  .use(resourceRateLimit)
  .handler(async () => {
    // Fetch/validate lives in the update domain; the wire shape stays byte-identical.
    try {
      return await fetchLatestRelease()
    } catch (err) {
      if (err instanceof DomainError) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { message: err.message })
      }
      throw err
    }
  })

export const githubRouter = {
  avatar,
  release,
}
