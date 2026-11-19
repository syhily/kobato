import type { Database } from '@kobato/db/database.ts'
import type { User } from '@kobato/db/types.ts'

import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPLEXITY_RE,
  passwordWithinBcryptLimit,
} from '@kobato/auth/security.ts'
import { findUserByEmail, findUserById, PASSWORD_HASH_ROUNDS, updateUserById } from '@kobato/db/operations/user.ts'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record.ts'
import { deleteAllCredentials } from '@kobato/server/domains/auth/passkey/service.ts'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives.ts'
import {
  authFlowError,
  authFlowSuccess,
  type AuthFlowResult,
  type SigninFlowContext,
} from '@kobato/server/domains/auth/services/shared.ts'
import { consumeToken, issueResetToken, revokeTokensFor } from '@kobato/server/domains/auth/verification-tokens.ts'
import { resolveSiteOrigin } from '@kobato/server/domains/settings/site-origin.ts'
import { sendPasswordReset } from '@kobato/server/infra/email/sender.ts'
import { tryPasswordResetByEmailRateLimit, tryPasswordResetRateLimit } from '@kobato/server/infra/rate-limit.ts'
import bcrypt from 'bcryptjs'

/**
 * Cross-domain dependency wired by the caller: the claim path needs the comments
 * domain's approved-commenter check, which auth must not import.
 */
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

/**
 * `lostpassword`: always appears to succeed — an unknown account and a tripped rate
 * limit yield the same message.
 */
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
  // Rotating the password kills every other credential-bypass token on the account:
  // remaining reset links, magic signin links, and pending OTPs.
  await revokeTokensFor(db, result.userId, 'password-reset')
  await revokeTokensFor(db, result.userId, 'signin-link')
  await revokeTokensFor(db, result.userId, 'signin-otp')
  try {
    await deleteAllCredentials(db, result.userId)
  } catch {
    // Best-effort: don't block password reset if passkey cleanup fails.
  }

  const dbUser = await findUserById(db, result.userId)
  if (!dbUser?.role || dbUser.deletedAt) {
    return authFlowError('auth.signin.error.accountCannotSignIn')
  }
  // Use the returned `setCookie`: a later `commitSession` would mint a second sid and
  // orphan the one just written.
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
