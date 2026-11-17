import { generateAuthenticationOptions } from '@kobato/server/domains/auth/passkey/service.ts'
import { passkeyGuard, publicProc } from '@kobato/server/http/orpc-base.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { tryPasskeyAuthBeginRateLimit } from '@kobato/server/infra/rate-limit.ts'
import { z } from 'zod'

/**
 * Public passkey endpoints. `authBegin` is CSRF-less: it only returns a
 * single-use 5-minute challenge — no data is read or mutated.
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
      throw new DomainError('RATE_LIMITED', descriptorFor('auth.passkey.error.rateLimited'))
    }
    const { options } = await generateAuthenticationOptions(context.db, input.email)
    return { options }
  })

export const passkeyPublicRouter = {
  authBegin,
}
