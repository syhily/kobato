import { z } from 'zod'

import { generateAuthenticationOptions } from '../../domains/auth/passkey/service'
import { descriptorFor } from '../../infra/http/error-descriptor'
import { DomainError } from '../../infra/http/errors'
import { tryPasskeyAuthBeginRateLimit } from '../../infra/rate-limit'
import { passkeyGuard, publicProc } from '../orpc-base'

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
