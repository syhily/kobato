import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import bcrypt from 'bcryptjs'

import type { AuthFlowResult } from '@/server/domains/auth/otp-flow'
import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { User } from '@/server/infra/db/types'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { deleteAllCredentials } from '@/server/domains/auth/passkey-service'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { MIN_PASSWORD_LENGTH, PASSWORD_COMPLEXITY_RE } from '@/server/domains/auth/schema'
import { consumeToken, issueResetToken } from '@/server/domains/auth/verification-tokens'
import { countApprovedCommentsByUser } from '@/server/domains/comments/repos/public-query/by-id'
import { findUserByEmail, findUserById, PASSWORD_HASH_ROUNDS, updateUserById } from '@/server/infra/db/operations/user'
import { sendPasswordReset } from '@/server/infra/email/sender'
import { tryPasswordResetByEmailRateLimit, tryPasswordResetRateLimit } from '@/server/infra/rate-limit'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const GENERIC_RESET_MESSAGE = '如果该邮箱存在且符合要求，重置邮件已发送。'

/**
 * Issue a single-use reset token, build the reset link, send the email,
 * and audit the request. Shared by the existing-user and the
 * commenter-claim paths — only the audited actor role differs.
 */
async function issueTokenAndEmail(
  db: NodePgDatabase,
  user: User,
  actorRole: string,
  clientAddress: string,
  request: Request,
): Promise<void> {
  const { token } = await issueResetToken(db, user.id)
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
 * `lostpassword` — request a password-reset email.
 *
 * Always appears to succeed to prevent email enumeration: the generic
 * message is returned whether or not the email maps to an account, and
 * a tripped rate limit silently short-circuits with the same message.
 */
export async function requestPasswordReset(
  db: NodePgDatabase,
  clientAddress: string,
  request: Request,
  formData: FormData,
): Promise<AuthFlowResult> {
  const email = formData.get('email')
  const emailStr = typeof email === 'string' ? email : ''
  // Rate-limit before any lookup to prevent abuse. Two additive
  // buckets: per-IP catches one attacker fanning out across many
  // mailboxes; per-email catches one attacker rotating IPs against
  // a single mailbox. Either tripping silently short-circuits with
  // the generic success message so neither path leaks which limit
  // (or even which email) was throttled.
  const [ipLimit, emailLimit] = await Promise.all([
    tryPasswordResetRateLimit(clientAddress),
    emailStr ? tryPasswordResetByEmailRateLimit(emailStr) : Promise.resolve(null),
  ])
  if (ipLimit.exceeded || emailLimit?.exceeded) {
    return { type: 'success', message: GENERIC_RESET_MESSAGE }
  }
  if (emailStr) {
    const u = await findUserByEmail(db, emailStr)
    if (u && u.role && !u.deletedAt) {
      // Existing user with a role — send reset email.
      await issueTokenAndEmail(db, u, u.role, clientAddress, request)
    } else if (u && !u.role && u.password === '' && !u.deletedAt) {
      // Anonymous commenter with at least one approved comment can
      // claim the account by setting a password.
      const approved = await countApprovedCommentsByUser(db, u.id)
      if (approved >= 1) {
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
  db: NodePgDatabase,
  session: BlogSession,
  clientAddress: string,
  request: Request,
  formData: FormData,
  redirectTo: string,
  purpose: 'password-reset' | 'author-invite',
): Promise<AuthFlowResult> {
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
  await updateUserById(db, result.userId, { password: hashed, passkeyForce: false })
  try {
    await deleteAllCredentials(db, result.userId)
  } catch {
    // Best-effort: don't block password reset if passkey cleanup fails.
  }

  const dbUser = await findUserById(db, result.userId)
  if (!dbUser || !dbUser.role || dbUser.deletedAt) {
    return { type: 'error', message: '账户状态异常，无法登录。' }
  }
  // `{ revokeOtherSessions: true }` enforces the reset invariant: every
  // other session of this user (incl. anything an attacker might still
  // hold) is destroyed before the new one is issued.
  // `establishLoginSession` mints the sid + cookie itself (so we can
  // index the real cookie sid against Redis); use its returned
  // `setCookie` rather than re-committing the in-memory session —
  // calling `commitSession` after would mint a SECOND sid and orphan
  // the one we just wrote.
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
