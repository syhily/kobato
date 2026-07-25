// Sign-in flows — the single owner of the auth session-key state machine
// (credential, OTP, passkey, password reset, initial setup). Previously
// split across otp-flow / password-flow / passkey-flow / flows with the
// shared AuthFlowResult type homeless in otp-flow and the OTP pending
// lifecycle leaking into the route loader; all of that lives here now.
//
// OTP pending state contract: `pendingOtpUser` / `otpFailCount` session
// keys are read and written ONLY by this module. The signin loader uses
// `readLivePendingOtp` — it never touches the keys directly.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import bcrypt from 'bcryptjs'

import type { BlogSession, PendingOtpUser } from '@/server/domains/auth/session-storage'
import type { User } from '@/server/infra/db/types'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { isPasskeyEnabled } from '@/server/domains/auth/passkey-gate'
import { deleteAllCredentials, verifyAuthenticationResponse } from '@/server/domains/auth/passkey-service'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { MIN_PASSWORD_LENGTH, PASSWORD_COMPLEXITY_RE, signInSchema } from '@/server/domains/auth/schema'
import { commitSessionWithMaxAge } from '@/server/domains/auth/session-storage'
import { invalidateSetupToken } from '@/server/domains/auth/setup-token'
import { consumeToken, issueOtpToken, issueResetToken, verifyOtpToken } from '@/server/domains/auth/verification-tokens'
import { hasApprovedComments } from '@/server/domains/comments/services/public-query'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import {
  findUserByEmail,
  findUserById,
  hasAdmin,
  insertAdmin,
  PASSWORD_HASH_ROUNDS,
  updateUserById,
  verifyUserPassword,
} from '@/server/infra/db/operations/user'
import { checkMailReady, sendPasswordReset, sendSignInOtp } from '@/server/infra/email/sender'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import {
  tryOtpSendByEmailRateLimit,
  tryOtpSendRateLimit,
  tryOtpVerifyByEmailRateLimit,
  tryOtpVerifyRateLimit,
  tryPasskeyAuthFinishRateLimit,
  tryPasswordResetByEmailRateLimit,
  tryPasswordResetRateLimit,
  tryRateLimit,
  trySignInByEmailRateLimit,
} from '@/server/infra/rate-limit'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { idFromString } from '@/shared/utils/id'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('auth.signin')

export type AuthFlowResult =
  | { type: 'redirect'; to: string; setCookie?: string }
  | { type: 'error'; message: string; setCookie?: string }
  | { type: 'success'; message: string; setCookie?: string }

function formFieldString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

// ─── OTP pending state (session keys owned by this module) ──────────────

/**
 * The loader-facing projection of the OTP pending state. Returns the live
 * pending entry, or clears it (both session keys) and reports `expired`
 * when it has outlived its TTL. This is the ONLY place the expiry rule
 * exists — the signin loader never reads the session keys directly.
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

function clearPendingOtp(session: BlogSession): void {
  session.unset('pendingOtpUser')
  session.unset('otpFailCount')
}

/** Parse the pending entry's userId; a malformed entry is cleared and reported. */
function parsePendingUserId(session: BlogSession, pendingOtpUser: PendingOtpUser): bigint | null {
  try {
    return BigInt(pendingOtpUser.userId)
  } catch {
    clearPendingOtp(session)
    return null
  }
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

/**
 * The full "issue + send + stage + audit" OTP sequence shared by the
 * initial staging (credential login) and resend. Returns an error result
 * on failure; on success the caller decides the response shape.
 */
async function issueAndSendOtp(
  db: NodePgDatabase,
  session: BlogSession,
  clientAddress: string,
  request: Request,
  dbUser: { id: bigint; name: string; email: string; role: string | null },
  { resend }: { resend: boolean },
): Promise<AuthFlowResult | null> {
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
    details: resend ? { email: dbUser.email, resend: true } : { email: dbUser.email },
  })
  return null
}

export async function handleOtpCancel(session: BlogSession, redirectTo: string): Promise<AuthFlowResult> {
  clearPendingOtp(session)
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

  const userId = parsePendingUserId(session, pendingOtpUser)
  if (userId === null) {
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
      clearPendingOtp(session)
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

  clearPendingOtp(session)

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

  const userId = parsePendingUserId(session, pendingOtpUser)
  if (userId === null) {
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

  const failure = await issueAndSendOtp(db, session, clientAddress, request, dbUser, { resend: true })
  if (failure) {
    return failure
  }
  return {
    type: 'success',
    message: '验证码已重新发送。',
    setCookie: await commitSessionWithMaxAge(session),
  }
}

// ─── Credential login ────────────────────────────────────────────────────

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
  const failure = await issueAndSendOtp(db, session, clientAddress, request, dbUser, { resend: false })
  if (failure) {
    return failure
  }
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

// ─── Passkey signin ──────────────────────────────────────────────────────

export async function signInWithPasskey(
  db: NodePgDatabase,
  session: BlogSession,
  clientAddress: string,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
  if (!isPasskeyEnabled()) {
    return { type: 'error', message: 'Passkey 登录未启用。' }
  }
  const rawResponse = formData.get('passkey_response')
  const rawChallenge = formData.get('passkey_challenge')
  if (!rawResponse || typeof rawResponse !== 'string' || !rawChallenge || typeof rawChallenge !== 'string') {
    return { type: 'error', message: 'Passkey 响应缺失。' }
  }
  let response: unknown
  try {
    response = JSON.parse(rawResponse)
  } catch {
    return { type: 'error', message: 'Passkey 响应格式错误。' }
  }
  const limit = await tryPasskeyAuthFinishRateLimit(clientAddress)
  if (limit.exceeded) {
    return { type: 'error', message: '操作过于频繁，请稍后再试。' }
  }
  try {
    const result = await verifyAuthenticationResponse(
      db,
      // parsed JSON validated by verifyAuthenticationResponse
      unsafeCast<Parameters<typeof verifyAuthenticationResponse>[1]>(response),
      rawChallenge,
    )
    const established = await establishLoginSession(db, session, result.user, request, clientAddress, {
      authMethod: 'passkey',
    })
    return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Passkey 验证失败，请重试。'
    return { type: 'error', message }
  }
}

// ─── Password reset ──────────────────────────────────────────────────────

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
      if (await hasApprovedComments(db, u.id)) {
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
  // `establishLoginSession` mints the sid + cookie itself (so the real
  // cookie sid is the one written to the session table); use its returned
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

// ─── Initial setup ───────────────────────────────────────────────────────

export interface SignUpAdminSeed {
  title: string
  name: string
  email: string
  password: string
}

export async function signUpInitialAdminWithSession(
  db: NodePgDatabase,
  pool: Pool,
  {
    title,
    name,
    email,
    password,
    session,
    request,
    clientAddress,
  }: SignUpAdminSeed & {
    session: BlogSession
    request: Request
    clientAddress: string
  },
): Promise<AuthFlowResult> {
  if (await hasAdmin(db)) {
    return {
      type: 'error',
      message: '管理员账号已存在，请直接登录后继续初始化。',
    }
  }

  // Composition only: the settings domain owns the section seed
  // (`services/install-flow` builds and validates all 18 rows); here the
  // admin insert and the seed share one transaction so a fresh install
  // commits — or rolls back — atomically.
  const seedRows = buildInstallSectionRows({ title, name, email, hostname: new URL(request.url).hostname })
  if (!seedRows.ok) {
    return {
      type: 'error',
      message: seedRows.message,
    }
  }

  const admin = await db.transaction(async (tx) => {
    const users = await insertAdmin(tx, name, email, password)
    const admin = users[0]
    if (!admin) {
      throw new DomainError('INTERNAL', '创建管理员账号失败')
    }
    await seedInstallSections(tx, seedRows.rows, idFromString(admin.id))
    return admin
  })

  const established = await establishLoginSession(db, session, admin, request, clientAddress)

  await refreshBlogSettings(db)
  await invalidateSetupToken(db)

  return {
    type: 'redirect',
    to: '/admin',
    setCookie: established.setCookie,
  }
}
