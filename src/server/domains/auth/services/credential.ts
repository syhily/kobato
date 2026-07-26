// Credential signin flow — email + password, with the passkey-force
// refusal and the OTP staging branch when OTP is enabled.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { signInSchema } from '@/server/domains/auth/schema'
import { sendOtpAndStageSession } from '@/server/domains/auth/services/otp'
import { formFieldString, type AuthFlowResult, type SigninFlowContext } from '@/server/domains/auth/services/shared'
import { findUserByEmail, verifyUserPassword } from '@/server/infra/db/operations/user'
import { checkMailReady } from '@/server/infra/email/sender'
import { tryRateLimit, trySignInByEmailRateLimit } from '@/server/infra/rate-limit'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

function parseLoginInput(formData: FormData): { email: string; password: string } | null {
  const email = formFieldString(formData, 'email')
  const password = formFieldString(formData, 'password')
  const parsed = signInSchema.safeParse({ email, password })
  return parsed.success ? parsed.data : null
}

function isOtpEnabled(): boolean {
  const bundle = getBlogSettingsBundleSync()
  const mail = bundle?.mail?.mail
  return bundle?.security?.otp?.enabled === true && mail !== undefined && checkMailReady(mail).ready
}

async function checkLoginRateLimits(clientAddress: string, email: string): Promise<{ exceeded: boolean }> {
  const [loginLimit, signInEmailLimit] = await Promise.all([
    tryRateLimit(clientAddress),
    trySignInByEmailRateLimit(email),
  ])
  return { exceeded: loginLimit.exceeded || signInEmailLimit.exceeded }
}

async function checkPasskeyForce(db: NodePgDatabase, email: string): Promise<boolean> {
  const bundle = getBlogSettingsBundleSync()
  if (bundle?.security?.passkey?.enabled !== true) {
    return false
  }
  const existingUser = await findUserByEmail(db, email)
  return existingUser !== null && Boolean(existingUser.passkeyForce) && Boolean(existingUser.role)
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

  const passkeyForced = await checkPasskeyForce(db, input.email)
  if (passkeyForced) {
    return {
      type: 'error',
      message: '该账户已强制使用 Passkey 登录，请使用 Passkey 方式登录。',
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
    if (isOtpEnabled()) {
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

  if (isOtpEnabled()) {
    return sendOtpAndStageSession(ctx, request, dbUser, redirectTo)
  }

  const established = await establishLoginSession(db, session, dbUser, request, clientAddress)
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}
