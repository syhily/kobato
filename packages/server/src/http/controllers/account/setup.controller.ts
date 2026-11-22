import type { SetupVerifyTokenError, SetupVerifyTokenOutput } from '@kobato/api/contracts/setup'
import type { AuthFlowError } from '@kobato/server/domains/auth/services/shared'

import { accountSetupContract } from '@kobato/api/rpc/account/setup'
import { signUpAdminSchema } from '@kobato/server/domains/auth/schema'
import { signUpInitialAdminWithSession } from '@kobato/server/domains/auth/services/setup'
import { authFlowError, authFlowValidationError } from '@kobato/server/domains/auth/services/shared'
import { getSetupToken, isSetupTokenActive, verifySetupToken } from '@kobato/server/domains/auth/setup-token'
import { wireAuthFlow } from '@kobato/server/http/controllers/account/auth-shared'
import { implementPublic } from '@kobato/server/http/orpc-base'
import { tryKeyedRateLimit } from '@kobato/server/infra/rate-limit'

const SETUP_VERIFY_BUCKET = { windowSeconds: 3600, maxAttempts: 10 }

function verifyError(flow: AuthFlowError, status?: 429): SetupVerifyTokenError {
  return {
    kind: 'error',
    message: flow.message,
    ...(flow.descriptor === undefined ? {} : { descriptor: flow.descriptor }),
    ...(status === undefined ? {} : { status }),
  }
}

const status = implementPublic(accountSetupContract).status.handler(async ({ context }) => {
  try {
    await getSetupToken(context.db)
  } catch {}
  const csrfToken = context.session.get('csrfToken')
  return {
    setupTokenVerified: context.session.get('setupTokenVerified') === true,
    csrfToken: typeof csrfToken === 'string' ? csrfToken : null,
  }
})

const verifyToken = implementPublic(accountSetupContract).verifyToken.handler(
  async ({ input, context }): Promise<SetupVerifyTokenOutput> => {
    const { exceeded } = await tryKeyedRateLimit(
      `rate-limit:setup-verify:${context.clientAddress}`,
      SETUP_VERIFY_BUCKET,
    )
    if (exceeded) {
      return verifyError(authFlowError('auth.setup.error.rateLimited'), 429)
    }
    if (!input.token) {
      return verifyError(authFlowError('auth.setup.error.tokenRequired'))
    }
    const isValid = await verifySetupToken(context.db, input.token)
    if (!isValid) {
      return verifyError(authFlowError('auth.setup.error.tokenInvalid'))
    }
    context.session.set('setupTokenVerified', true)
    context.markSessionDirty()
    return { kind: 'verified' }
  },
)

const install = implementPublic(accountSetupContract).install.handler(async ({ input, context }) => {
  if (context.session.get('setupTokenVerified') !== true) {
    return wireAuthFlow(authFlowError('auth.setup.error.tokenNotVerified'), context)
  }
  if (!(await isSetupTokenActive(context.db))) {
    return wireAuthFlow(authFlowError('auth.setup.error.tokenExpired'), context)
  }
  const parsed = signUpAdminSchema.safeParse({
    title: input.title,
    name: input.name,
    email: input.email,
    password: input.password,
    locale: input.locale,
  })
  if (!parsed.success) {
    return wireAuthFlow(authFlowValidationError('auth.setup.error.formIncomplete', parsed.error.issues), context)
  }
  const result = await signUpInitialAdminWithSession(context.db, {
    ...parsed.data,
    session: context.session,
    request: context.request,
    clientAddress: context.clientAddress,
  })
  return wireAuthFlow(result, context)
})

export const setupRouter = implementPublic(accountSetupContract).router({
  status,
  verifyToken,
  install,
})
