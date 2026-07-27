import { data, redirect, useNavigation } from 'react-router'

import type { AuthFlowResult } from '@/server/domains/auth/services/shared'

import { validateCsrfForAction } from '@/server/domains/auth/csrf'
import { signInWithPasskey } from '@/server/domains/auth/passkey/signin'
import { handleCredentialLogin } from '@/server/domains/auth/services/credential'
import { handleOtpCancel, handleOtpResend, handleOtpVerify } from '@/server/domains/auth/services/otp'
import { requestPasswordReset, resetPasswordWithToken } from '@/server/domains/auth/services/password-reset'
import { hasApprovedComments } from '@/server/domains/comments/services/public-query'
import { ensureInstalledOrRedirect } from '@/server/domains/settings/install-gate'
import { loadSigninData } from '@/server/http/loaders/signin'
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

// The flow routing (logout branch, token peek, OTP-session branching)
// lives in `@/server/http/loaders/signin` — this route is wiring only.
export async function loader({ request, context }: Route.LoaderArgs) {
  return loadSigninData({ request, context })
}

export async function action({ request, context }: Route.ActionArgs) {
  const rc = getRequestContext({ request, context })
  const db = rc.db
  await ensureInstalledOrRedirect(db)

  const { session, clientAddress, url } = rc
  const redirectTo = safeRedirectPath(url.searchParams.get('redirect_to'), '/admin', url.origin)
  const action = url.searchParams.get('action')

  const formData = await request.formData()

  if (!validateCsrfForAction(session, request, formData)) {
    return data({ error: '安全校验失败，请刷新页面后重试。' })
  }

  if (action === 'lostpassword') {
    // The routes layer may touch both domains, so it wires the comments
    // domain's "established commenter" check into the reset flow — the
    // auth domain itself stays free of the comments import.
    return toActionResult(await requestPasswordReset(db, clientAddress, request, formData, { hasApprovedComments }))
  }

  if (action === 'resetpassword' || action === 'accept-invite') {
    const purpose = action === 'resetpassword' ? 'password-reset' : 'author-invite'
    return toActionResult(await resetPasswordWithToken(rc, request, formData, redirectTo, purpose))
  }

  if (action === 'cancelotp') {
    return toActionResult(await handleOtpCancel(rc, redirectTo))
  }

  if (action === 'verifyotp') {
    return toActionResult(await handleOtpVerify(rc, request, formData, redirectTo))
  }

  if (action === 'resendotp') {
    return toActionResult(await handleOtpResend(rc, request))
  }

  if (action === 'passkey') {
    return toActionResult(await signInWithPasskey(rc, request, formData, redirectTo))
  }

  return toActionResult(await handleCredentialLogin(rc, request, formData, redirectTo), {
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
          email={unsafeCast<string>(loaderData.pendingOtpEmail)}
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
