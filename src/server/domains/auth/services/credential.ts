// Credential signin flow — email + password, with the passkey-method
// refusal and the OTP staging branch when mail is ready.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { isPasskeySigninUser } from '@/server/domains/auth/passkey/gate'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { signInSchema } from '@/server/domains/auth/schema'
import { sendOtpAndStageSession } from '@/server/domains/auth/services/otp'
import {
  formFieldString,
  isMailLoginReady,
  type AuthFlowResult,
  type SigninFlowContext,
} from '@/server/domains/auth/services/shared'
import { findUserByEmail, verifyUserPassword } from '@/server/infra/db/operations/user'
import { tryRateLimit, trySignInByEmailRateLimit } from '@/server/infra/rate-limit'

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

async function checkPasskeyMethod(db: NodePgDatabase, email: string): Promise<boolean> {
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
    return { type: 'error', message: '请填写正确的邮箱和密码。' }
  }

  const rateLimit = await checkLoginRateLimits(clientAddress, input.email)
  if (rateLimit.exceeded) {
    return {
      type: 'error',
      message: '登录失败次数过多，请稍后再试。',
    }
  }

  const passkeyMethod = await checkPasskeyMethod(db, input.email)
  if (passkeyMethod) {
    return {
      type: 'error',
      message: '该账户已选择 Passkey 登陆，请使用 Passkey 方式登陆。',
    }
  }

  const dbUser = await verifyUserPassword(db, input.email, input.password)
  if (!dbUser || !dbUser.role) {
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
    return {
      type: 'error',
      message: '请填写正确的邮箱和密码。',
    }
  }

  if (isMailLoginReady()) {
    return sendOtpAndStageSession(ctx, request, dbUser, redirectTo)
  }

  const established = await establishLoginSession(db, session, dbUser, request, clientAddress)
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}
