import { githubContract } from '@kobato/api/github.ts'
import { fetchGithubAvatarDataUrl } from '@kobato/server/domains/comments/services/avatar.ts'
import { fetchLatestRelease } from '@kobato/server/domains/update/release.ts'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { ORPCError } from '@orpc/server'

// The limiter attaches per procedure
const impl = implementPublic(githubContract)

const avatar = impl.avatar.use(resourceRateLimit).handler(async () => {
  return { avatar: await fetchGithubAvatarDataUrl() }
})

const release = impl.release.use(resourceRateLimit).handler(async () => {
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

export const githubRouter = impl.router({
  avatar,
  release,
})
