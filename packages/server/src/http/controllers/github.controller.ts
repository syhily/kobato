import { githubContract } from '@kobato/api/rpc/github'
import { fetchGithubAvatarDataUrl } from '@kobato/server/domains/comments/services/avatar'
import { fetchLatestRelease } from '@kobato/server/domains/update/release'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { DomainError } from '@kobato/server/infra/http/errors'
import { ORPCError } from '@orpc/server'

const impl = implementPublic(githubContract)

const avatar = impl.avatar.use(resourceRateLimit).handler(async () => {
  return { avatar: await fetchGithubAvatarDataUrl() }
})

const release = impl.release.use(resourceRateLimit).handler(async () => {
  try {
    return await fetchLatestRelease()
  } catch (err) {
    if (err instanceof DomainError) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: err.message })
    }
    throw err
  }
})

export const githubRouter = impl.router({
  avatar,
  release,
})
