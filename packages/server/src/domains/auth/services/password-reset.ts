import type { Database } from '@kobato/db/sqlite/database'
import type { User } from '@kobato/db/sqlite/types'

import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPLEXITY_RE,
  passwordWithinBcryptLimit,
} from '@kobato/auth/security'
import {
  findUserByEmail,
  findUserById,
  PASSWORD_HASH_ROUNDS,
  updateUserById,
} from '@kobato/db/sqlite/operations/identity/user'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record'
import { deleteAllCredentials } from '@kobato/server/domains/auth/passkey/service'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives'
import {
  authFlowError,
  authFlowSuccess,
  type AuthFlowResult,
  type SigninFlowContext,
} from '@kobato/server/domains/auth/services/shared'
import { consumeToken, issueResetToken, revokeTokensFor } from '@kobato/server/domains/auth/verification-tokens'
import { resolveSiteOrigin } from '@kobato/server/domains/settings/site-origin'
import { sendPasswordReset } from '@kobato/server/infra/email/sender'
import { tryPasswordResetByEmailRateLimit, tryPasswordResetRateLimit } from '@kobato/server/infra/rate-limit'
import bcrypt from 'bcryptjs'

export interface PasswordResetFlowDeps {
  hasApprovedComments(db: Database, userId: number): Promise<boolean>
}

async function issueTokenAndEmail(
  db: Database,
  user: User,
  actorRole: string,
  clientAddress: string,
  request: Request,
): Promise<void> {
  const { token } = issueResetToken(db, user.id)
  const origin = resolveSiteOrigin(request)
  const link = `${origin}/admin/signin?action=resetpassword&token=${encodeURIComponent(token)}`
  await sendPasswordReset(user, link)
  recordAuditEvent({
    action: 'password_reset_requested',
    resourceType: 'user',
    resourceId: String(user.id),
    actorId: user.id,
    actorRole,
    ipAddress: clientAddress,
    userAgent: request.headers.get('User-Agent'),
  })
}

export async function requestPasswordReset(
  db: Database,
  clientAddress: string,
  request: Request,
  formData: FormData,
  deps: PasswordResetFlowDeps,
): Promise<AuthFlowResult> {
  const email = formData.get('email')
  const emailStr = typeof email === 'string' ? email : ''
  const [ipLimit, emailLimit] = await Promise.all([
    tryPasswordResetRateLimit(clientAddress),
    emailStr ? tryPasswordResetByEmailRateLimit(emailStr) : Promise.resolve(null),
  ])
  if (ipLimit.exceeded || emailLimit?.exceeded) {
    return authFlowSuccess('auth.passwordReset.sent')
  }
  if (emailStr) {
    const u = await findUserByEmail(db, emailStr)
    if (u?.role && !u.deletedAt) {
      await issueTokenAndEmail(db, u, u.role, clientAddress, request)
    } else if (u && !u.role && u.password === '' && !u.deletedAt) {
      if (await deps.hasApprovedComments(db, u.id)) {
        await updateUserById(db, u.id, { role: 'visitor' })
        await issueTokenAndEmail(db, u, 'visitor', clientAddress, request)
      }
    }
  }
  return authFlowSuccess('auth.passwordReset.sent')
}

export async function resetPasswordWithToken(
  ctx: SigninFlowContext,
  request: Request,
  formData: FormData,
  redirectTo: string,
  purpose: 'password-reset' | 'author-invite',
): Promise<AuthFlowResult> {
  const { db, session, clientAddress } = ctx
  const rawToken = formData.get('reset_token')
  const newPassword = formData.get('password')
  const rawTokenStr = typeof rawToken === 'string' ? rawToken : ''
  const newPasswordStr = typeof newPassword === 'string' ? newPassword : ''

  if (!newPasswordStr || newPasswordStr.length < MIN_PASSWORD_LENGTH) {
    return authFlowError('auth.passwordReset.error.passwordTooShort', { min: MIN_PASSWORD_LENGTH })
  }
  if (!passwordWithinBcryptLimit(newPasswordStr)) {
    return authFlowError('auth.passwordReset.error.passwordTooLong', { max: MAX_PASSWORD_BYTES })
  }
  if (!PASSWORD_COMPLEXITY_RE.test(newPasswordStr)) {
    return authFlowError('auth.passwordReset.error.passwordComplexity')
  }

  const result = await consumeToken(db, rawTokenStr, purpose)
  if (result === null) {
    return authFlowError('auth.signin.error.invalidToken')
  }

  const hashed = await bcrypt.hash(newPasswordStr, PASSWORD_HASH_ROUNDS)
  await updateUserById(db, result.userId, { password: hashed, loginMethod: 'password' })
  await revokeTokensFor(db, result.userId, 'password-reset')
  await revokeTokensFor(db, result.userId, 'signin-link')
  await revokeTokensFor(db, result.userId, 'signin-otp')
  try {
    await deleteAllCredentials(db, result.userId)
  } catch {}

  const dbUser = await findUserById(db, result.userId)
  if (!dbUser?.role || dbUser.deletedAt) {
    return authFlowError('auth.signin.error.accountCannotSignIn')
  }
  const established = await establishLoginSession(db, session, dbUser, request, clientAddress, {
    revokeOtherSessions: true,
  })
  recordAuditEvent({
    action: 'password_reset_complete',
    resourceType: 'user',
    resourceId: String(dbUser.id),
    actorId: dbUser.id,
    actorRole: dbUser.role,
    ipAddress: clientAddress,
    userAgent: request.headers.get('User-Agent'),
  })
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}
