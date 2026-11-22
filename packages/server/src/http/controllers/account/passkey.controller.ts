import { passkeyContract } from '@kobato/api/rpc/account/passkey'
import { generateAuthenticationOptions } from '@kobato/server/domains/auth/passkey/service'
import { signInWithPasskey } from '@kobato/server/domains/auth/passkey/signin'
import {
  authFlowContext,
  authFlowFormData,
  safeActionRedirect,
  wireAuthFlow,
} from '@kobato/server/http/controllers/account/auth-shared'
import { implementPublic, passkeyGuard } from '@kobato/server/http/orpc-base'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { tryPasskeyAuthBeginRateLimit } from '@kobato/server/infra/rate-limit'

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

const authFinish = implementPublic(passkeyContract).authFinish.handler(async ({ input, context }) => {
  const result = await signInWithPasskey(
    authFlowContext(context),
    context.request,
    authFlowFormData({ passkey_response: input.response, passkey_challenge: input.challenge }),
    safeActionRedirect(input.redirectTo, context),
  )
  return wireAuthFlow(result, context)
})

export const passkeyRouter = implementPublic(passkeyContract).router({
  authBegin,
  authFinish,
})
