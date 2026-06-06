import { z } from 'zod'

import { isPasskeyEnabled } from '@/server/domains/auth/passkey-gate'
import { generateAuthenticationOptions } from '@/server/domains/auth/passkey-service'
import { publicProc } from '@/server/http/orpc-base'
import { DomainError } from '@/server/infra/http/errors'
import { tryPasskeyAuthBeginRateLimit } from '@/server/infra/rate-limit'

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
  .handler(async ({ input, context }) => {
    if (!isPasskeyEnabled()) {
      throw new DomainError('BAD_REQUEST', 'Passkey 登录未启用。')
    }
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
