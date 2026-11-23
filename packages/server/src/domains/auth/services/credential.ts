import type { Database } from '@kobato/db/sqlite/database'

import { findUserByEmail, verifyUserPassword } from '@kobato/db/sqlite/operations/identity/user'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record'
import { isPasskeySigninUser } from '@kobato/server/domains/auth/passkey/gate'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives'
import { signInSchema } from '@kobato/server/domains/auth/schema'
import { sendOtpAndStageSession } from '@kobato/server/domains/auth/services/otp'
import {
  authFlowError,
  formFieldString,
  isMailLoginReady,
  type AuthFlowResult,
  type SigninFlowContext,
} from '@kobato/server/domains/auth/services/shared'
import { tryRateLimit, trySignInByEmailRateLimit } from '@kobato/server/infra/rate-limit'

function parseLoginInput(formData: FormData): { email: string; password: string } | null {
  const email = formFieldString(formData, 'email')
  const password = formFieldString(formData, 'password')
  const parsed = signInSchema.safeParse({ email, password })
  return parsed.success ? parsed.data : null
}

async function checkLoginRateLimits(clientAddress: string, email: string): Promise<{ exceeded: boolean }> {
  const [loginLimit, signInEmailLimit] = await Promise.all([
    tryRateLimit(clientAddress),
    trySignInByEmailRateLimit(email),
  ])
  return { exceeded: loginLimit.exceeded || signInEmailLimit.exceeded }
}

async function checkPasskeyMethod(db: Database, email: string): Promise<boolean> {
  const existingUser = await findUserByEmail(db, email)
  return isPasskeySigninUser(existingUser)
}

export async function handleCredentialLogin(
  ctx: SigninFlowContext,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
  const { db, clientAddress, session } = ctx
  const input = parseLoginInput(formData)
  if (!input) {
    return authFlowError('auth.signin.error.credentialsRequired')
  }

  const rateLimit = await checkLoginRateLimits(clientAddress, input.email)
  if (rateLimit.exceeded) {
    return authFlowError('auth.signin.error.tooManyAttempts')
  }

  const passkeyMethod = await checkPasskeyMethod(db, input.email)
  if (passkeyMethod) {
    return authFlowError('auth.signin.error.passkeyRequired')
  }

  const dbUser = await verifyUserPassword(db, input.email, input.password)
  if (!dbUser?.role) {
    recordAuditEvent({
      action: 'credential_login_failed',
      resourceType: 'user',
      resourceId: dbUser ? String(dbUser.id) : null,
      ipAddress: clientAddress,
      userAgent: request.headers.get('User-Agent'),
      details: { email: input.email, reason: 'invalid_credentials' },
    })
    if (isMailLoginReady()) {
      return {
        type: 'redirect',
        to: `/admin/signin?error=invalid_credentials&redirect_to=${encodeURIComponent(redirectTo)}`,
      }
    }
    return authFlowError('auth.signin.error.invalidCredentials')
  }

  if (isMailLoginReady()) {
    return sendOtpAndStageSession(ctx, request, dbUser, redirectTo)
  }

  const established = await establishLoginSession(db, session, dbUser, request, clientAddress)
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}
