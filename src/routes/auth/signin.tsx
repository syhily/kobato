import bcrypt from 'bcryptjs'
import { data, redirect } from 'react-router'

import { recordAuditEvent } from '@/server/domains/audit/service'
import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { validateCsrfForAction } from '@/server/domains/auth/csrf'
import {
  type AuthFlowResult,
  handleCredentialLogin,
  handleOtpCancel,
  handleOtpResend,
  handleOtpVerify,
} from '@/server/domains/auth/otp-flow'
import { isPasskeyEnabled } from '@/server/domains/auth/passkey-gate'
import { deleteAllCredentials, verifyAuthenticationResponse } from '@/server/domains/auth/passkey-service'
import { establishLoginSession, logout } from '@/server/domains/auth/primitives'
import { MIN_PASSWORD_LENGTH, PASSWORD_COMPLEXITY_RE } from '@/server/domains/auth/schema'
import { commitSessionWithMaxAge, destroySession } from '@/server/domains/auth/session-storage'
import { consumeToken, issueResetToken, peekToken } from '@/server/domains/auth/verification-tokens'
import { countApprovedCommentsByUser } from '@/server/domains/comments/repos/public-query/by-id'
import { ensureInstalledOrRedirect } from '@/server/domains/settings/install-gate'
import {
  findUserByEmail,
  findUserById,
  PASSWORD_HASH_ROUNDS,
  updateLastLogin,
  updateUserById,
} from '@/server/infra/db/operations/user'
import { sendPasswordReset } from '@/server/infra/email/sender'
import {
  tryPasskeyAuthBeginRateLimit,
  tryPasswordResetByEmailRateLimit,
  tryPasswordResetRateLimit,
} from '@/server/infra/rate-limit'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { safeRedirectPath } from '@/shared/utils/safe-url'
import { LoginForm, LostPasswordForm, OtpForm, ResetPasswordForm } from '@/ui/admin/auth/AdminCredentialsForm'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'

import type { Route } from './+types/signin'

function hasMessage(data: unknown): data is { message: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof (data as Record<string, unknown>).message === 'string'
  )
}

function hasError(data: unknown): data is { error: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as Record<string, unknown>).error === 'string'
  )
}

function toActionResult(result: AuthFlowResult, extraData?: Record<string, unknown>) {
  const headers: Record<string, string> = {}
  if (result.setCookie) {
    headers['Set-Cookie'] = result.setCookie
  }
  switch (result.type) {
    case 'redirect':
      return redirect(result.to, { headers })
    case 'error':
      return data({ error: result.message, ...extraData }, { headers })
    case 'success':
      return data({ message: result.message, ...extraData }, { headers })
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  await ensureInstalledOrRedirect(db)

  const { session, user, url, clientAddress } = getRouteRequestContext({ request, context })
  const redirectTo = safeRedirectPath(url.searchParams.get('redirect_to'), '/', url.origin)
  const action = url.searchParams.get('action')

  if (action === 'logout') {
    const user = session.get('user')
    await logout(session)
    if (user) {
      recordAuditEvent({
        action: 'logout',
        resourceType: 'session',
        resourceId: session.id,
        actorId: user.id,
        actorRole: user.role,
        ipAddress: clientAddress,
        userAgent: request.headers.get('User-Agent'),
      })
    }
    throw redirect(redirectTo, {
      headers: { 'Set-Cookie': await destroySession(session) },
    })
  }

  if (user) {
    throw redirect(redirectTo)
  }

  // For reset / invite, surface a token error on the loader so the UI
  // can short-circuit before the user types a new password. `peekToken`
  // is read-only on purpose — the action below consumes the token only
  // after the form is submitted.
  let tokenError: string | null = null
  let resetToken: string | null = null
  if ((action === 'resetpassword' || action === 'accept-invite') && url.searchParams.has('token')) {
    const rawToken = url.searchParams.get('token')!
    const purpose = action === 'resetpassword' ? 'password-reset' : 'author-invite'
    const result = await peekToken(db, rawToken, purpose)
    if (result === null) {
      tokenError = '链接无效或已过期。'
    } else {
      resetToken = rawToken
    }
  }

  // OTP pending state: if the user has already passed password check
  // but not yet verified the OTP, show the OTP form instead.
  const pendingOtpUser = session.get('pendingOtpUser')
  if (pendingOtpUser) {
    if (pendingOtpUser.expiresAt < Date.now()) {
      session.unset('pendingOtpUser')
      session.unset('otpFailCount')
      throw redirect(`/admin/signin?redirect_to=${encodeURIComponent(redirectTo)}`, {
        headers: { 'Set-Cookie': await commitSessionWithMaxAge(session) },
      })
    }
    return data({
      redirectTo,
      action: 'verifyotp',
      tokenError,
      resetToken,
      pendingOtpEmail: pendingOtpUser.email,
      pendingOtpSentAt: pendingOtpUser.sentAt,
      authError: url.searchParams.get('error'),
      passkeyEnabled: isPasskeyEnabled(),
    })
  }

  const authError = url.searchParams.get('error')
  return data({
    redirectTo,
    action: action ?? 'login',
    tokenError,
    resetToken,
    authError,
    passkeyEnabled: isPasskeyEnabled(),
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const db = getDbFromContext({ request, context })
  await ensureInstalledOrRedirect(db)

  const { session, clientAddress, url } = getRouteRequestContext({ request, context })
  const redirectTo = safeRedirectPath(url.searchParams.get('redirect_to'), '/admin', url.origin)
  const action = url.searchParams.get('action')

  const formData = await request.formData()

  // CSRF guard for all non-GET auth form actions.
  if (!validateCsrfForAction(session, request, formData)) {
    return data({ error: '安全校验失败，请刷新页面后重试。' })
  }

  if (action === 'lostpassword') {
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
      return data({ error: null, message: '如果该邮箱存在且符合要求，重置邮件已发送。' })
    }
    // Always appear to succeed to prevent email enumeration.
    if (emailStr) {
      const u = await findUserByEmail(db, emailStr)
      if (u && u.role && !u.deletedAt) {
        // Existing user with a role — send reset email.
        const { token } = await issueResetToken(db, u.id)
        const origin = new URL(request.url).origin
        const link = `${origin}/admin/signin?action=resetpassword&token=${encodeURIComponent(token)}`
        await sendPasswordReset(u, link)
        recordAuditEvent({
          action: 'password_reset_requested',
          resourceType: 'user',
          resourceId: String(u.id),
          actorId: u.id,
          actorRole: u.role,
          ipAddress: clientAddress,
          userAgent: request.headers.get('User-Agent'),
        })
      } else if (u && !u.role && u.password === '' && !u.deletedAt) {
        // Anonymous commenter with at least one approved comment can
        // claim the account by setting a password.
        const approved = await countApprovedCommentsByUser(db, u.id)
        if (approved >= 1) {
          await updateUserById(db, u.id, { role: 'visitor' })
          const { token } = await issueResetToken(db, u.id)
          const origin = new URL(request.url).origin
          const link = `${origin}/admin/signin?action=resetpassword&token=${encodeURIComponent(token)}`
          await sendPasswordReset(u, link)
          recordAuditEvent({
            action: 'password_reset_requested',
            resourceType: 'user',
            resourceId: String(u.id),
            actorId: u.id,
            actorRole: 'visitor',
            ipAddress: clientAddress,
            userAgent: request.headers.get('User-Agent'),
          })
        }
      }
    }
    return data({ error: null, message: '如果该邮箱存在且符合要求，重置邮件已发送。' })
  }

  if (action === 'resetpassword' || action === 'accept-invite') {
    const rawToken = formData.get('reset_token')
    const newPassword = formData.get('password')
    const rawTokenStr = typeof rawToken === 'string' ? rawToken : ''
    const newPasswordStr = typeof newPassword === 'string' ? newPassword : ''
    const purpose = action === 'resetpassword' ? 'password-reset' : 'author-invite'

    if (!newPasswordStr || newPasswordStr.length < MIN_PASSWORD_LENGTH) {
      return data({ error: `密码长度至少 ${MIN_PASSWORD_LENGTH} 位。` })
    }
    if (!PASSWORD_COMPLEXITY_RE.test(newPasswordStr)) {
      return data({ error: '密码必须包含至少一个大写字母、一个小写字母和一个数字。' })
    }

    const result = await consumeToken(db, rawTokenStr, purpose)
    if (result === null) {
      return data({ error: '链接无效或已过期。' })
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
      return data({ error: '账户状态异常，无法登录。' })
    }
    // `{ revokeOtherSessions: true }` enforces invariant 2 at the top
    // of this branch: every other session of this user (incl. anything
    // an attacker might still hold) is destroyed before the new one
    // is issued. `establishLoginSession` mints the sid + cookie itself
    // (so we can index the real cookie sid against Redis); use its
    // returned `setCookie` rather than re-committing the in-memory
    // session — calling `commitSession` after would mint a SECOND sid
    // and orphan the one we just wrote.
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
    return redirect(redirectTo, { headers: { 'Set-Cookie': established.setCookie } })
  }

  if (action === 'cancelotp') {
    return toActionResult(await handleOtpCancel(session, redirectTo))
  }

  if (action === 'verifyotp') {
    return toActionResult(await handleOtpVerify(db, session, clientAddress, request, formData, redirectTo))
  }

  if (action === 'resendotp') {
    return toActionResult(await handleOtpResend(db, session, clientAddress, request))
  }

  if (action === 'passkey') {
    const rawResponse = formData.get('passkey_response')
    const rawChallenge = formData.get('passkey_challenge')
    if (!rawResponse || typeof rawResponse !== 'string' || !rawChallenge || typeof rawChallenge !== 'string') {
      return data({ error: 'Passkey 响应缺失。' })
    }
    let response: unknown
    try {
      response = JSON.parse(rawResponse)
    } catch {
      return data({ error: 'Passkey 响应格式错误。' })
    }
    const limit = await tryPasskeyAuthBeginRateLimit(clientAddress)
    if (limit.exceeded) {
      return data({ error: '操作过于频繁，请稍后再试。' })
    }
    try {
      const result = await verifyAuthenticationResponse(
        db,
        response as Parameters<typeof verifyAuthenticationResponse>[1],
        rawChallenge,
      )
      const established = await establishLoginSession(db, session, result.user, request, clientAddress, {
        authMethod: 'passkey',
      })
      await updateLastLogin(db, BigInt(result.user.id), clientAddress, request.headers.get('User-Agent'))
      recordAuditEvent({
        action: 'login',
        resourceType: 'session',
        resourceId: session.id,
        actorId: BigInt(result.user.id),
        actorRole: result.user.role,
        ipAddress: clientAddress,
        userAgent: request.headers.get('User-Agent'),
        details: { method: 'passkey' },
      })
      return redirect(redirectTo, { headers: { 'Set-Cookie': established.setCookie } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey verification failed. Please try again.'
      return data({ error: message })
    }
  }

  return toActionResult(await handleCredentialLogin(db, session, clientAddress, request, formData, redirectTo), {
    redirectTo,
  })
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '用户登陆' }, bundleFromMatches(matches))
}

export default function LoginRoute({ actionData, loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="text-center">
        <BrandLogo className="mx-auto mb-10 h-20 w-auto" />
      </header>

      {hasError(actionData) || hasMessage(actionData) || loaderData.tokenError || loaderData.authError ? (
        <div className="text-center text-sm leading-relaxed">
          {hasError(actionData) ? (
            <p role="alert" aria-live="polite" className="text-destructive">
              {actionData.error}
            </p>
          ) : null}
          {loaderData.authError ? (
            <p role="alert" aria-live="polite" className="text-destructive">
              {loaderData.authError}
            </p>
          ) : null}
          {hasMessage(actionData) ? (
            <output aria-live="polite" className="text-status-success-fg">
              {actionData.message}
            </output>
          ) : null}
          {loaderData.tokenError ? (
            <p role="alert" aria-live="polite" className="text-destructive">
              {loaderData.tokenError}
            </p>
          ) : null}
        </div>
      ) : null}

      {loaderData.action === 'login' && <LoginForm passkeyEnabled={loaderData.passkeyEnabled} />}
      {loaderData.action === 'verifyotp' && 'pendingOtpEmail' in loaderData && 'pendingOtpSentAt' in loaderData && (
        <OtpForm email={loaderData.pendingOtpEmail as string} sentAt={loaderData.pendingOtpSentAt as number} />
      )}
      {loaderData.action === 'lostpassword' && <LostPasswordForm />}
      {(loaderData.action === 'resetpassword' || loaderData.action === 'accept-invite') && loaderData.resetToken && (
        <ResetPasswordForm token={loaderData.resetToken} />
      )}
    </div>
  )
}
