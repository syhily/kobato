import { fetchGithubAvatarDataUrl } from '@kobato/server/domains/comments/services/avatar'
import { fetchLatestRelease } from '@kobato/server/domains/update/release'
import { publicProc, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { DomainError } from '@kobato/server/infra/http/errors'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'

const avatar = publicProc
  .route({ method: 'GET', path: '/github/avatar' })
  .output(z.object({ avatar: z.string() }))
  .use(resourceRateLimit)
  .handler(async ({ context }) => {
    // The fetch + base64 inlining lives in the comments domain
    // (`services/avatar`); upstream failures resolve to '' there.
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
    // The fetch/validate logic lives in the update domain; the wire shape
    // (ORPCError code + message) stays byte-identical to the pre-extraction
    // handler.
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
