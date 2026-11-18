import { passkeyContract } from '@kobato/api/passkey.ts'
import { generateAuthenticationOptions } from '@kobato/server/domains/auth/passkey/service.ts'
import { implementPublic, passkeyGuard } from '@kobato/server/http/orpc-base.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { tryPasskeyAuthBeginRateLimit } from '@kobato/server/infra/rate-limit.ts'

// Contract-first: method/path/input/output live in `@kobato/api/passkey.ts`;
// this controller only implements the procedures.

/**
 * Public passkey endpoints. `authBegin` is CSRF-less: it only returns a
 * single-use 5-minute challenge — no data is read or mutated.
 */
const authBegin = implementPublic(passkeyContract)
  .authBegin.use(passkeyGuard)
  .handler(async ({ input, context }) => {
    const limit = await tryPasskeyAuthBeginRateLimit(context.clientAddress)
    if (limit.exceeded) {
      throw new DomainError('RATE_LIMITED', descriptorFor('auth.passkey.error.rateLimited'))
    }
    const { options } = await generateAuthenticationOptions(context.db, input.email)
    return { options }
  })

export const passkeyPublicRouter = implementPublic(passkeyContract).router({
  authBegin,
})
