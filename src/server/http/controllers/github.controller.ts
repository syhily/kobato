import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { fetchGithubAvatarDataUrl } from '@/server/domains/comments/services/avatar'
import { fetchLatestRelease } from '@/server/domains/update/release'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { DomainError } from '@/server/infra/http/errors'

const avatar = publicProc
  .route({ method: 'GET', path: '/github/avatar' })
  .output(z.object({ avatar: z.string() }))
  .use(resourceRateLimit)
  .handler(async ({ context }) => {
    // Fetch + base64 inlining lives in the comments domain; upstream failures resolve to ''.
    return { avatar: await fetchGithubAvatarDataUrl(context.db) }
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
  .handler(async ({ context }) => {
    // Fetch/validate lives in the update domain; the wire shape stays byte-identical.
    try {
      return await fetchLatestRelease(context.db)
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
