import { generateAuthenticationOptions } from '@kobato/server/domains/auth/passkey/service'
import { passkeyGuard, publicProc } from '@kobato/server/http/orpc-base'
import { DomainError } from '@kobato/server/infra/http/errors'
import { tryPasskeyAuthBeginRateLimit } from '@kobato/server/infra/rate-limit'
import { z } from 'zod'

/**
 * Public passkey authentication endpoints.
 *
 * `authBegin` is a public POST with no CSRF token. This is acceptable
 * because it only returns a single-use challenge that expires in 5 minutes;
 * no data is read or mutated.
 */

const authBegin = publicProc
  .route({ method: 'POST', path: '/passkey/auth-begin' })
  .input(
    z.object({
      email: z.email().optional(),
    }),
  )
  .output(z.object({ options: z.any() }))
  .use(passkeyGuard)
  .handler(async ({ input, context }) => {
    const limit = await tryPasskeyAuthBeginRateLimit(context.clientAddress)
    if (limit.exceeded) {
      throw new DomainError('RATE_LIMITED', '操作过于频繁，请稍后再试。')
    }
    const { options } = await generateAuthenticationOptions(context.db, input.email)
    return { options }
  })

export const passkeyPublicRouter = {
  authBegin,
}
