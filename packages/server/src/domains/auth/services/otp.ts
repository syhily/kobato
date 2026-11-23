import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'
import type { BlogSession, PendingOtpUser } from '@kobato/server/domains/auth/session-storage'

import { findUserById } from '@kobato/db/sqlite/operations/identity/user'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives'
import {
  authFlowError,
  authFlowSuccess,
  formFieldString,
  type AuthFlowResult,
  type SigninFlowContext,
} from '@kobato/server/domains/auth/services/shared'
import { issueOtpToken, verifyOtpToken } from '@kobato/server/domains/auth/verification-tokens'
import { sendSignInOtp } from '@kobato/server/infra/email/sender'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { getLogger } from '@kobato/server/infra/logger'
import {
  tryOtpSendByEmailRateLimit,
  tryOtpSendRateLimit,
  tryOtpVerifyByEmailRateLimit,
  tryOtpVerifyRateLimit,
} from '@kobato/server/infra/rate-limit'
import { idFromString } from '@kobato/utils/id'

const log = getLogger('auth.signin')

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

async function sendOtpSafely(
  user: { name: string; email: string },
  otpCode: string,
): Promise<{ ok: true } | { ok: false; error: ErrorMessageDescriptor }> {
  try {
    const result = await sendSignInOtp(user, otpCode)
    if (!result.ok) {
      return { ok: false, error: descriptorFor('auth.otp.error.sendFailed') }
    }
    return { ok: true }
  } catch (error) {
    log.error('OTP send failed unexpectedly', { email: user.email, error })
    return { ok: false, error: descriptorFor('auth.otp.error.sendFailed') }
  }
}

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
    return authFlowError('auth.otp.error.sendTooFrequent')
  }

  const { otpCode, expiresAt } = await issueOtpToken(db, dbUser.id)
  const sendResult = await sendOtpSafely(dbUser, otpCode)
  if (!sendResult.ok) {
    return { type: 'error', message: sendResult.error.fallbackMessage, descriptor: sendResult.error }
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
    return authFlowError('auth.otp.error.notStarted')
  }

  const [ipLimit, emailLimit] = await Promise.all([
    tryOtpVerifyRateLimit(clientAddress),
    tryOtpVerifyByEmailRateLimit(pendingOtpUser.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    return authFlowError('auth.otp.error.verifyTooFrequent')
  }

  const userId = parsePendingUserId(ctx, pendingOtpUser)
  if (userId === null) {
    return authFlowError('auth.otp.error.stateInvalid')
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
        resourceId: pendingOtpUser.userId,
        actorId: userId,
        ipAddress: clientAddress,
        userAgent: request.headers.get('User-Agent'),
        details: { email: pendingOtpUser.email, failCount, lockedOut: true },
      })
      return authFlowError('auth.otp.error.lockedOut')
    }
    recordAuditEvent({
      action: 'otp_failed',
      resourceType: 'user',
      resourceId: pendingOtpUser.userId,
      actorId: userId,
      ipAddress: clientAddress,
      userAgent: request.headers.get('User-Agent'),
      details: { email: pendingOtpUser.email, failCount },
    })
    return authFlowError('auth.otp.error.invalid')
  }

  clearPendingOtp(ctx)

  const dbUser = await findUserById(db, userId)
  if (!dbUser?.role || dbUser.deletedAt) {
    return authFlowError('auth.otp.error.accountCannotSignIn')
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
    return authFlowError('auth.otp.error.notStarted')
  }

  const userId = parsePendingUserId(ctx, pendingOtpUser)
  if (userId === null) {
    return authFlowError('auth.otp.error.stateInvalid')
  }

  const dbUser = await findUserById(db, userId)
  if (!dbUser?.role || dbUser.deletedAt) {
    return authFlowError('auth.otp.error.accountInvalid')
  }

  const failure = await issueAndSendOtp(ctx, request, dbUser, { resend: true })
  if (failure) {
    return failure
  }
  return authFlowSuccess('auth.otp.success.resent')
}
