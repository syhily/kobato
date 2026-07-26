import { data, redirect, useNavigation } from 'react-router'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { getDbFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { validateCsrfForAction } from '@/server/domains/auth/csrf'
import { isPasskeyEnabled } from '@/server/domains/auth/passkey-gate'
import { logout } from '@/server/domains/auth/primitives'
import { commitSessionWithMaxAge, destroySession } from '@/server/domains/auth/session-storage'
import {
  type AuthFlowResult,
  handleCredentialLogin,
  handleOtpCancel,
  handleOtpResend,
  handleOtpVerify,
  readLivePendingOtp,
  requestPasswordReset,
  resetPasswordWithToken,
  signInWithPasskey,
} from '@/server/domains/auth/signin-flow'
import { peekToken } from '@/server/domains/auth/verification-tokens'
import { ensureInstalledOrRedirect } from '@/server/domains/settings/install-gate'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { safeRedirectPath } from '@/shared/utils/safe-url'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
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

  const { session, user, url } = getRouteRequestContext({ request, context })
  const redirectTo = safeRedirectPath(url.searchParams.get('redirect_to'), '/', url.origin)
  const action = url.searchParams.get('action')

  if (action === 'logout') {
    const user = session.get('user')
    await logout(session)
    if (user) {
      recordAuditEventFromContext(getRequestContext({ request, context }), {
        action: 'logout',
        resourceType: 'session',
        resourceId: session.id,
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
    const rawToken = url.searchParams.get('token')
    if (!rawToken) {
      tokenError = '链接无效或已过期。'
    } else {
      const purpose = action === 'resetpassword' ? 'password-reset' : 'author-invite'
      const result = await peekToken(db, rawToken, purpose)
      if (result === null) {
        tokenError = '链接无效或已过期。'
      } else {
        resetToken = rawToken
      }
    }
  }

  // OTP pending state: the domain owns the session keys and the expiry
  // rule — the loader only consumes the projection.
  const otpState = readLivePendingOtp(session)
  if (otpState.expired) {
    throw redirect(`/admin/signin?redirect_to=${encodeURIComponent(redirectTo)}`, {
      headers: { 'Set-Cookie': await commitSessionWithMaxAge(session) },
    })
  }
  const pendingOtpUser = otpState.pending
  if (pendingOtpUser) {
    return data({
      redirectTo,
      action: 'verifyotp',
      tokenError,
      resetToken,
      pendingOtpEmail: pendingOtpUser.email,
      pendingOtpSentAt: pendingOtpUser.sentAt,
      authError: url.searchParams.get('error'),
      passkeyEnabled: isPasskeyEnabled(),
      csrfToken: session.get('csrfToken'),
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
    csrfToken: session.get('csrfToken'),
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
    return toActionResult(await requestPasswordReset(db, clientAddress, request, formData))
  }

  if (action === 'resetpassword' || action === 'accept-invite') {
    const purpose = action === 'resetpassword' ? 'password-reset' : 'author-invite'
    return toActionResult(
      await resetPasswordWithToken(db, session, clientAddress, request, formData, redirectTo, purpose),
    )
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
    return toActionResult(await signInWithPasskey(db, session, clientAddress, request, formData, redirectTo))
  }

  return toActionResult(await handleCredentialLogin(db, session, clientAddress, request, formData, redirectTo), {
    redirectTo,
  })
}

export const meta = titleMeta('用户登陆')

function localizeAuthError(error: string | null): string | null {
  if (error === null) {
    return null
  }
  if (error === 'invalid_credentials') {
    return '用户名或密码不正确。'
  }
  return error
}

export default function LoginRoute({ actionData, loaderData }: Route.ComponentProps) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting' && navigation.formMethod === 'POST'
  const csrfToken = loaderData.csrfToken

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
              {localizeAuthError(loaderData.authError)}
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

      {loaderData.action === 'login' && (
        <LoginForm passkeyEnabled={loaderData.passkeyEnabled} isSubmitting={isSubmitting} csrfToken={csrfToken} />
      )}
      {loaderData.action === 'verifyotp' && 'pendingOtpEmail' in loaderData && 'pendingOtpSentAt' in loaderData && (
        <OtpForm
          // narrowed by 'in' check above
          email={unsafeCast<string>(loaderData.pendingOtpEmail)}
          // narrowed by 'in' check above
          sentAt={unsafeCast<number>(loaderData.pendingOtpSentAt)}
          isSubmitting={isSubmitting}
          csrfToken={csrfToken}
          actionData={actionData}
        />
      )}
      {loaderData.action === 'lostpassword' && <LostPasswordForm isSubmitting={isSubmitting} csrfToken={csrfToken} />}
      {(loaderData.action === 'resetpassword' || loaderData.action === 'accept-invite') && loaderData.resetToken && (
        <ResetPasswordForm token={loaderData.resetToken} isSubmitting={isSubmitting} csrfToken={csrfToken} />
      )}
    </div>
  )
}
