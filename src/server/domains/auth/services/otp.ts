// OTP signin flow — staging (issue + send + session), verify, resend,
// and cancel. The `pendingOtpUser` / `otpFailCount` session keys are
// read and written ONLY by this module.

import type { BlogSession, PendingOtpUser } from '@/server/domains/auth/session-storage'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { formFieldString, type AuthFlowResult, type SigninFlowContext } from '@/server/domains/auth/services/shared'
import { issueOtpToken, verifyOtpToken } from '@/server/domains/auth/verification-tokens'
import { findUserById } from '@/server/infra/db/operations/user'
import { sendSignInOtp } from '@/server/infra/email/sender'
import { getLogger } from '@/server/infra/logger'
import {
  tryOtpSendByEmailRateLimit,
  tryOtpSendRateLimit,
  tryOtpVerifyByEmailRateLimit,
  tryOtpVerifyRateLimit,
} from '@/server/infra/rate-limit'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('auth.signin')

/**
 * Loader-facing projection of the OTP pending state; clears both keys
 * and reports `expired` past TTL. The ONLY place the expiry rule exists.
 */
export function readLivePendingOtp(session: BlogSession): { pending: PendingOtpUser | null; expired: boolean } {
  const pending = session.get('pendingOtpUser')
  if (!pending) {
    return { pending: null, expired: false }
  }
  if (pending.expiresAt < Date.now()) {
    session.unset('pendingOtpUser')
    session.unset('otpFailCount')
    return { pending: null, expired: true }
  }
  return { pending, expired: false }
}

function clearPendingOtp(ctx: SigninFlowContext): void {
  ctx.session.unset('pendingOtpUser')
  ctx.session.unset('otpFailCount')
  ctx.markSessionDirty()
}

function parsePendingUserId(ctx: SigninFlowContext, pendingOtpUser: PendingOtpUser): number | null {
  try {
    return idFromString(pendingOtpUser.userId)
  } catch {
    clearPendingOtp(ctx)
    return null
  }
}

/**
 * Send the OTP email; upstream failures and exceptions funnel into the
 * same user-facing error result.
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

/**
 * Issue + send + stage + audit, shared by initial staging and resend;
 * returns an error result on failure, null on success.
 */
async function issueAndSendOtp(
  ctx: SigninFlowContext,
  request: Request,
  dbUser: { id: number; name: string; email: string; role: string | null },
  { resend }: { resend: boolean },
): Promise<AuthFlowResult | null> {
  const { db, session, clientAddress } = ctx
  const [ipLimit, emailLimit] = await Promise.all([
    tryOtpSendRateLimit(clientAddress),
    tryOtpSendByEmailRateLimit(dbUser.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    return {
      type: 'error',
      message: '发送过于频繁，请稍后再试。',
    }
  }

  const { otpCode, expiresAt } = await issueOtpToken(db, dbUser.id)
  const sendResult = await sendOtpSafely(dbUser, otpCode)
  if (!sendResult.ok) {
    return { type: 'error', message: sendResult.error }
  }

  session.set('pendingOtpUser', {
    userId: String(dbUser.id),
    email: dbUser.email,
    expiresAt: expiresAt.getTime(),
    sentAt: Date.now(),
  })
  session.set('otpFailCount', 0)
  ctx.markSessionDirty()

  recordAuditEvent({
    action: 'otp_sent',
    resourceType: 'user',
    resourceId: String(dbUser.id),
    actorId: dbUser.id,
    actorRole: dbUser.role,
    ipAddress: clientAddress,
    userAgent: request.headers.get('User-Agent'),
    details: resend ? { email: dbUser.email, resend: true } : { email: dbUser.email },
  })
  return null
}

export async function sendOtpAndStageSession(
  ctx: SigninFlowContext,
  request: Request,
  dbUser: { id: number; name: string; email: string; role: string | null },
  redirectTo: string,
): Promise<AuthFlowResult> {
  const failure = await issueAndSendOtp(ctx, request, dbUser, { resend: false })
  if (failure) {
    return failure
  }
  return {
    type: 'redirect',
    to: `/admin/signin?action=verifyotp&redirect_to=${encodeURIComponent(redirectTo)}`,
  }
}

export async function handleOtpCancel(ctx: SigninFlowContext, redirectTo: string): Promise<AuthFlowResult> {
  clearPendingOtp(ctx)
  return {
    type: 'redirect',
    to: `/admin/signin?redirect_to=${encodeURIComponent(redirectTo)}`,
  }
}

export async function handleOtpVerify(
  ctx: SigninFlowContext,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
  const { db, session, clientAddress } = ctx
  const pendingOtpUser = session.get('pendingOtpUser')
  if (!pendingOtpUser) {
    return { type: 'error', message: '请先完成登录。' }
  }

  const [ipLimit, emailLimit] = await Promise.all([
    tryOtpVerifyRateLimit(clientAddress),
    tryOtpVerifyByEmailRateLimit(pendingOtpUser.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    return {
      type: 'error',
      message: '操作过于频繁，请稍后再试。',
    }
  }

  const userId = parsePendingUserId(ctx, pendingOtpUser)
  if (userId === null) {
    return {
      type: 'error',
      message: '登录状态异常，请重新登录。',
    }
  }

  const otpCode = formFieldString(formData, 'otp_code')
  const result = await verifyOtpToken(db, userId, otpCode)

  if (result === null) {
    const failCount = (session.get('otpFailCount') ?? 0) + 1
    session.set('otpFailCount', failCount)
    ctx.markSessionDirty()
    if (failCount >= 3) {
      clearPendingOtp(ctx)
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
    }
  }

  clearPendingOtp(ctx)

  const dbUser = await findUserById(db, userId)
  if (!dbUser || !dbUser.role || dbUser.deletedAt) {
    return {
      type: 'error',
      message: '账户状态异常，无法登录。',
    }
  }

  const established = await establishLoginSession(db, session, dbUser, request, clientAddress, {
    authMethod: 'otp',
  })
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}

export async function handleOtpResend(ctx: SigninFlowContext, request: Request): Promise<AuthFlowResult> {
  const { db, session } = ctx
  const pendingOtpUser = session.get('pendingOtpUser')
  if (!pendingOtpUser) {
    return { type: 'error', message: '请先完成登录。' }
  }

  const userId = parsePendingUserId(ctx, pendingOtpUser)
  if (userId === null) {
    return {
      type: 'error',
      message: '登录状态异常，请重新登录。',
    }
  }

  const dbUser = await findUserById(db, userId)
  if (!dbUser || !dbUser.role || dbUser.deletedAt) {
    return { type: 'error', message: '账户状态异常。' }
  }

  const failure = await issueAndSendOtp(ctx, request, dbUser, { resend: true })
  if (failure) {
    return failure
  }
  return {
    type: 'success',
    message: '验证码已重新发送。',
  }
}
