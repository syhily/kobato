// Password reset / claim flows — `lostpassword` (request a reset email,
// enumeration-safe) and `resetpassword` / `accept-invite` (consume the
// single-use token and set a new password).

import bcrypt from 'bcryptjs'

import type { AuthFlowResult, SigninFlowContext } from '@/server/domains/auth/services/shared'
import type { Database } from '@/server/infra/db/database'
import type { User } from '@/server/infra/db/types'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { deleteAllCredentials } from '@/server/domains/auth/passkey/service'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { PASSWORD_COMPLEXITY_RE } from '@/server/domains/auth/schema'
import { consumeToken, issueResetToken } from '@/server/domains/auth/verification-tokens'
import { findUserByEmail, findUserById, PASSWORD_HASH_ROUNDS, updateUserById } from '@/server/infra/db/operations/user'
import { sendPasswordReset } from '@/server/infra/email/sender'
import { tryPasswordResetByEmailRateLimit, tryPasswordResetRateLimit } from '@/server/infra/rate-limit'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { MIN_PASSWORD_LENGTH } from '@/shared/utils/security'

const GENERIC_RESET_MESSAGE = '如果该邮箱存在且符合要求，重置邮件已发送。'

/**
 * Cross-domain dependency wired by the caller: the claim path needs the
 * comments domain's approved-commenter check, which auth must not import.
 */
export interface PasswordResetFlowDeps {
  hasApprovedComments(db: Database, userId: number): Promise<boolean>
}

/**
 * Issue a single-use reset token, email the link, and audit the request.
 * Shared by the existing-user and commenter-claim paths.
 */
async function issueTokenAndEmail(
  db: Database,
  user: User,
  actorRole: string,
  clientAddress: string,
  request: Request,
): Promise<void> {
  const { token } = issueResetToken(db, user.id)
  const origin = getBlogSettingsBundleSync()?.siteIdentity?.website ?? new URL(request.url).origin
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
 * `lostpassword` — request a password-reset email. Always appears to
 * succeed: no account and tripped rate limits yield the same message.
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
  // Either rate limit tripping silently returns the generic success message.
  const [ipLimit, emailLimit] = await Promise.all([
    tryPasswordResetRateLimit(clientAddress),
    emailStr ? tryPasswordResetByEmailRateLimit(emailStr) : Promise.resolve(null),
  ])
  if (ipLimit.exceeded || emailLimit?.exceeded) {
    return { type: 'success', message: GENERIC_RESET_MESSAGE }
  }
  if (emailStr) {
    const u = await findUserByEmail(db, emailStr)
    if (u?.role && !u.deletedAt) {
      await issueTokenAndEmail(db, u, u.role, clientAddress, request)
    } else if (u && !u.role && u.password === '' && !u.deletedAt) {
      // Anonymous commenter with an approved comment can claim the account.
      if (await deps.hasApprovedComments(db, u.id)) {
        await updateUserById(db, u.id, { role: 'visitor' })
        await issueTokenAndEmail(db, u, 'visitor', clientAddress, request)
      }
    }
  }
  return { type: 'success', message: GENERIC_RESET_MESSAGE }
}

/**
 * `resetpassword` / `accept-invite` — consume a single-use token and set
 * a new password. The two intents share this path; only the token
 * `purpose` differs.
 */
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
    return { type: 'error', message: `密码长度至少 ${MIN_PASSWORD_LENGTH} 位。` }
  }
  if (!PASSWORD_COMPLEXITY_RE.test(newPasswordStr)) {
    return { type: 'error', message: '密码必须包含至少一个大写字母、一个小写字母和一个数字。' }
  }

  const result = await consumeToken(db, rawTokenStr, purpose)
  if (result === null) {
    return { type: 'error', message: '链接无效或已过期。' }
  }

  const hashed = await bcrypt.hash(newPasswordStr, PASSWORD_HASH_ROUNDS)
  // Password reset also returns the account to password signin.
  await updateUserById(db, result.userId, { password: hashed, loginMethod: 'password' })
  try {
    await deleteAllCredentials(db, result.userId)
  } catch {
    // Best-effort: don't block password reset if passkey cleanup fails.
  }

  const dbUser = await findUserById(db, result.userId)
  if (!dbUser?.role || dbUser.deletedAt) {
    return { type: 'error', message: '账户状态异常，无法登录。' }
  }
  // Use the returned `setCookie` — a later `commitSession` would mint a
  // second sid and orphan the one just written.
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
