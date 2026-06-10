import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { signInSchema } from '@/server/domains/auth/schema'
import { commitSessionWithMaxAge } from '@/server/domains/auth/session-storage'
import { issueOtpToken, verifyOtpToken } from '@/server/domains/auth/verification-tokens'
import { findUserByEmail, findUserById, verifyUserPassword } from '@/server/infra/db/operations/user'
import { checkMailReady, sendSignInOtp } from '@/server/infra/email/sender'
import { getLogger } from '@/server/infra/logger'
import {
  tryOtpSendByEmailRateLimit,
  tryOtpSendRateLimit,
  tryOtpVerifyByEmailRateLimit,
  tryOtpVerifyRateLimit,
  tryRateLimit,
  trySignInByEmailRateLimit,
} from '@/server/infra/rate-limit'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('auth.otp')

export type AuthFlowResult =
  | { type: 'redirect'; to: string; setCookie?: string }
  | { type: 'error'; message: string; setCookie?: string }
  | { type: 'success'; message: string; setCookie?: string }

function formFieldString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Send an OTP email with fallback error handling.
 * Catches both upstream failures (returned as `{ok:false}`) and
 * unexpected exceptions (network / runtime errors).
 */
async function sendOtpSafely(
  user: { name: string; email: string },
  otpCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await sendSignInOtp(user, otpCode)
    if (!result.ok) {
      return { ok: false, error: '验证码发送失败，请稍后重试。' }
    }
    return { ok: true }
  } catch (error) {
    log.error('OTP send failed unexpectedly', { email: user.email, error })
    return { ok: false, error: '验证码发送失败，请稍后重试。' }
  }
}

export async function handleOtpCancel(session: BlogSession, redirectTo: string): Promise<AuthFlowResult> {
  session.unset('pendingOtpUser')
  session.unset('otpFailCount')
  return {
    type: 'redirect',
    to: `/admin/signin?redirect_to=${encodeURIComponent(redirectTo)}`,
    setCookie: await commitSessionWithMaxAge(session),
  }
}

export async function handleOtpVerify(
  db: NodePgDatabase,
  session: BlogSession,
  clientAddress: string,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
  const pendingOtpUser = session.get('pendingOtpUser')
  if (!pendingOtpUser) {
    return { type: 'error', message: '请先完成登录。', setCookie: await commitSessionWithMaxAge(session) }
  }

  const [ipLimit, emailLimit] = await Promise.all([
    tryOtpVerifyRateLimit(clientAddress),
    tryOtpVerifyByEmailRateLimit(pendingOtpUser.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    return {
      type: 'error',
      message: '操作过于频繁，请稍后再试。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  let userId: bigint
  try {
    userId = BigInt(pendingOtpUser.userId)
  } catch {
    session.unset('pendingOtpUser')
    session.unset('otpFailCount')
    return {
      type: 'error',
      message: '登录状态异常，请重新登录。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  const otpCode = formFieldString(formData, 'otp_code')
  const result = await verifyOtpToken(db, userId, otpCode)

  if (result === null) {
    const failCount = (session.get('otpFailCount') ?? 0) + 1
    session.set('otpFailCount', failCount)
    if (failCount >= 3) {
      session.unset('pendingOtpUser')
      session.unset('otpFailCount')
      recordAuditEvent({
        action: 'otp_failed',
        resourceType: 'user',
        resourceId: String(pendingOtpUser.userId),
        actorId: userId,
        ipAddress: clientAddress,
        userAgent: request.headers.get('User-Agent'),
        details: { email: pendingOtpUser.email, failCount, lockedOut: true },
      })
      return {
        type: 'error',
        message: '验证失败次数过多，请重新登录。',
        setCookie: await commitSessionWithMaxAge(session),
      }
    }
    recordAuditEvent({
      action: 'otp_failed',
      resourceType: 'user',
      resourceId: String(pendingOtpUser.userId),
      actorId: userId,
      ipAddress: clientAddress,
      userAgent: request.headers.get('User-Agent'),
      details: { email: pendingOtpUser.email, failCount },
    })
    return {
      type: 'error',
      message: '验证码无效或已过期。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  session.unset('pendingOtpUser')
  session.unset('otpFailCount')

  const dbUser = await findUserById(db, userId)
  if (!dbUser || !dbUser.role || dbUser.deletedAt) {
    return {
      type: 'error',
      message: '账户状态异常，无法登录。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  const established = await establishLoginSession(db, session, dbUser, request, clientAddress, {
    authMethod: 'otp',
  })
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}

export async function handleOtpResend(
  db: NodePgDatabase,
  session: BlogSession,
  clientAddress: string,
  request: Request,
): Promise<AuthFlowResult> {
  const pendingOtpUser = session.get('pendingOtpUser')
  if (!pendingOtpUser) {
    return { type: 'error', message: '请先完成登录。', setCookie: await commitSessionWithMaxAge(session) }
  }

  const [ipLimit, emailLimit] = await Promise.all([
    tryOtpSendRateLimit(clientAddress),
    tryOtpSendByEmailRateLimit(pendingOtpUser.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    return {
      type: 'error',
      message: '发送过于频繁，请稍后再试。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  let userId: bigint
  try {
    userId = BigInt(pendingOtpUser.userId)
  } catch {
    session.unset('pendingOtpUser')
    session.unset('otpFailCount')
    return {
      type: 'error',
      message: '登录状态异常，请重新登录。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  const dbUser = await findUserById(db, userId)
  if (!dbUser || !dbUser.role || dbUser.deletedAt) {
    return { type: 'error', message: '账户状态异常。', setCookie: await commitSessionWithMaxAge(session) }
  }

  const { otpCode, expiresAt } = await issueOtpToken(db, dbUser.id)
  const sendResult = await sendOtpSafely(dbUser, otpCode)
  if (!sendResult.ok) {
    return { type: 'error', message: sendResult.error, setCookie: await commitSessionWithMaxAge(session) }
  }

  session.set('pendingOtpUser', { ...pendingOtpUser, expiresAt: expiresAt.getTime(), sentAt: Date.now() })
  session.set('otpFailCount', 0)

  recordAuditEvent({
    action: 'otp_sent',
    resourceType: 'user',
    resourceId: String(dbUser.id),
    actorId: dbUser.id,
    actorRole: dbUser.role,
    ipAddress: clientAddress,
    userAgent: request.headers.get('User-Agent'),
    details: { email: dbUser.email, resend: true },
  })
  return {
    type: 'success',
    message: '验证码已重新发送。',
    setCookie: await commitSessionWithMaxAge(session),
  }
}

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

async function sendOtpAndStageSession(
  db: NodePgDatabase,
  session: BlogSession,
  clientAddress: string,
  request: Request,
  dbUser: { id: bigint; name: string; email: string; role: string | null },
  redirectTo: string,
): Promise<AuthFlowResult> {
  const [ipLimit, emailLimit] = await Promise.all([
    tryOtpSendRateLimit(clientAddress),
    tryOtpSendByEmailRateLimit(dbUser.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    return {
      type: 'error',
      message: '发送过于频繁，请稍后再试。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  const { otpCode, expiresAt } = await issueOtpToken(db, dbUser.id)
  const sendResult = await sendOtpSafely(dbUser, otpCode)
  if (!sendResult.ok) {
    return { type: 'error', message: sendResult.error, setCookie: await commitSessionWithMaxAge(session) }
  }

  session.set('pendingOtpUser', {
    userId: String(dbUser.id),
    email: dbUser.email,
    expiresAt: expiresAt.getTime(),
    sentAt: Date.now(),
  })
  session.set('otpFailCount', 0)

  recordAuditEvent({
    action: 'otp_sent',
    resourceType: 'user',
    resourceId: String(dbUser.id),
    actorId: dbUser.id,
    actorRole: dbUser.role,
    ipAddress: clientAddress,
    userAgent: request.headers.get('User-Agent'),
    details: { email: dbUser.email },
  })
  return {
    type: 'redirect',
    to: `/admin/signin?action=verifyotp&redirect_to=${encodeURIComponent(redirectTo)}`,
    setCookie: await commitSessionWithMaxAge(session),
  }
}

export async function handleCredentialLogin(
  db: NodePgDatabase,
  session: BlogSession,
  clientAddress: string,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
  const input = parseLoginInput(formData)
  if (!input) {
    return { type: 'error', message: '请填写正确的邮箱和密码。' }
  }

  const rateLimit = await checkLoginRateLimits(clientAddress, input.email)
  if (rateLimit.exceeded) {
    return {
      type: 'error',
      message: '登录失败次数过多，请稍后再试。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  const passkeyForced = await checkPasskeyForce(db, input.email)
  if (passkeyForced) {
    return {
      type: 'error',
      message: '该账户已强制使用 Passkey 登录，请使用 Passkey 方式登录。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  const dbUser = await verifyUserPassword(db, input.email, input.password)
  if (!dbUser || !dbUser.role) {
    if (isOtpEnabled()) {
      return {
        type: 'redirect',
        to: `/admin/signin?error=invalid_credentials&redirect_to=${encodeURIComponent(redirectTo)}`,
        setCookie: await commitSessionWithMaxAge(session),
      }
    }
    return {
      type: 'error',
      message: '请填写正确的邮箱和密码。',
      setCookie: await commitSessionWithMaxAge(session),
    }
  }

  if (isOtpEnabled()) {
    return sendOtpAndStageSession(db, session, clientAddress, request, dbUser, redirectTo)
  }

  const established = await establishLoginSession(db, session, dbUser, request, clientAddress)
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}
