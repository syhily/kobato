import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { AUTH_ACTION_REDIRECT_FALLBACK } from '@kobato/api/contracts/account/auth'
import { validateCsrfForAction } from '@kobato/server/domains/auth/csrf'
import { authFlowError } from '@kobato/server/domains/auth/services/shared'
import { getInstallState } from '@kobato/server/domains/settings/install-gate'
import { getRequestContext } from '@kobato/server/http/request-context'
import { createSsrCaller } from '@kobato/server/http/ssr-caller'
import { useI18n, type I18nValue } from '@kobato/ui/lib/I18nProvider'
import { safeRedirectPath } from '@kobato/utils/safe-url'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { LoginForm } from '@kobato/web-admin/ui/auth/AdminCredentialsForm'
import { LostPasswordForm } from '@kobato/web-admin/ui/auth/LostPasswordForm'
import { MagicLinkConfirmForm } from '@kobato/web-admin/ui/auth/MagicLinkConfirmForm'
import { OtpForm } from '@kobato/web-admin/ui/auth/OtpForm'
import { ResetPasswordForm } from '@kobato/web-admin/ui/auth/ResetPasswordForm'
import { BrandLogo } from '@kobato/web-public/ui/chrome/BrandLogo'
import { data, redirect, useNavigation } from 'react-router'

import {
  authErrorPayload,
  authMessagePayload,
  cookieHeaders,
  formField,
  toActionResult,
} from '@/routes/auth/flow-response'
import { titleMeta } from '@/seo/title-meta'

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

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  if ((await getInstallState(rc.db)) === 'noAdmin') {
    throw redirect('/admin/setup', { status: 303 })
  }

  const { caller } = createSsrCaller({ request, context })
  const result = await caller.account.auth.status({
    redirectTo: rc.url.searchParams.get('redirect_to'),
    action: rc.url.searchParams.get('action'),
    token: rc.url.searchParams.get('token'),
    error: rc.url.searchParams.get('error'),
  })
  if (result.kind === 'redirect') {
    throw redirect(result.to)
  }
  return data({
    redirectTo: result.redirectTo,
    action: result.action,
    tokenError: result.tokenError,
    resetToken: result.resetToken,
    magicToken: result.magicToken,
    authError: result.authError,
    csrfToken: result.csrfToken ?? undefined,
    ...('pendingOtpEmail' in result
      ? { pendingOtpEmail: result.pendingOtpEmail, pendingOtpSentAt: result.pendingOtpSentAt }
      : {}),
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const rc = getRequestContext({ request, context })
  const locale = rc.localization.locale
  if ((await getInstallState(rc.db)) === 'noAdmin') {
    throw redirect('/admin/setup', { status: 303 })
  }

  const { caller, responseHeaders } = createSsrCaller({ request, context })
  const redirectTo = rc.url.searchParams.get('redirect_to')
  const action = rc.url.searchParams.get('action')

  const formData = await request.formData()

  if (!validateCsrfForAction(rc.session, request, formData)) {
    return toActionResult(authFlowError('error.api.csrfFailed'), locale, responseHeaders)
  }

  if (action === 'logout') {
    return toActionResult(await caller.account.auth.logout({ redirectTo }), locale, responseHeaders)
  }

  if (action === 'lostpassword') {
    return toActionResult(
      await caller.account.auth.passwordResetRequest({ email: formField(formData, 'email') }),
      locale,
      responseHeaders,
    )
  }

  if (action === 'resetpassword' || action === 'accept-invite') {
    return toActionResult(
      await caller.account.auth.passwordReset({
        token: formField(formData, 'reset_token'),
        password: formField(formData, 'password'),
        purpose: action === 'resetpassword' ? 'password-reset' : 'author-invite',
        redirectTo,
      }),
      locale,
      responseHeaders,
    )
  }

  if (action === 'cancelotp') {
    return toActionResult(await caller.account.auth.otpCancel({ redirectTo }), locale, responseHeaders)
  }

  if (action === 'verifyotp') {
    return toActionResult(
      await caller.account.auth.otpVerify({ code: formField(formData, 'otp_code'), redirectTo }),
      locale,
      responseHeaders,
    )
  }

  if (action === 'resendotp') {
    return toActionResult(await caller.account.auth.otpResend({}), locale, responseHeaders)
  }

  if (action === 'passkey') {
    return toActionResult(
      await caller.account.passkey.authFinish({
        response: formField(formData, 'passkey_response'),
        challenge: formField(formData, 'passkey_challenge'),
        redirectTo,
      }),
      locale,
      responseHeaders,
    )
  }

  if (action === 'identify') {
    const result = await caller.account.auth.identify({ email: formField(formData, 'email'), redirectTo })
    switch (result.kind) {
      case 'passkey':
        return data({ method: 'passkey' as const })
      case 'password':
        return data({ method: 'password' as const })
      case 'magic-link-sent':
        return data(authMessagePayload(result.message, result.descriptor, locale), {
          headers: cookieHeaders(responseHeaders),
        })
      case 'error':
        return data(authErrorPayload(result.message, result.descriptor, locale), {
          headers: cookieHeaders(responseHeaders),
        })
    }
  }

  if (action === 'magiclink') {
    return toActionResult(
      await caller.account.auth.magicLink({ token: formField(formData, 'magic_token'), redirectTo }),
      locale,
      responseHeaders,
    )
  }

  return toActionResult(
    await caller.account.auth.login({
      email: formField(formData, 'email'),
      password: formField(formData, 'password'),
      redirectTo,
    }),
    locale,
    responseHeaders,
    { redirectTo: safeRedirectPath(redirectTo, AUTH_ACTION_REDIRECT_FALLBACK, rc.url.origin) },
  )
}

export const meta = titleMeta('meta.title.auth.signin')

const AUTH_ERROR_MESSAGE_IDS: Record<string, UiMessageId> = {
  invalid_credentials: 'auth.signin.error.invalidCredentials',
}

function authErrorText(error: string | null, t: I18nValue['t']): string | null {
  if (error === null) {
    return null
  }
  const messageId = AUTH_ERROR_MESSAGE_IDS[error]
  return messageId === undefined ? error : t(messageId)
}

export default function LoginRoute({ actionData, loaderData }: Route.ComponentProps) {
  const { t } = useI18n()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting' && navigation.formMethod === 'POST'
  const csrfToken = loaderData.csrfToken

  return (
    <div className="flex flex-col gap-8">
      <header className="text-center">
        <BrandLogo alt="" className="mx-auto mb-10 h-20 w-auto" />
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
              {authErrorText(loaderData.authError, t)}
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
        <LoginForm
          redirectTo={loaderData.redirectTo}
          isSubmitting={isSubmitting}
          csrfToken={csrfToken}
          actionData={actionData}
        />
      )}
      {loaderData.action === 'magiclink' && loaderData.magicToken && (
        <MagicLinkConfirmForm token={loaderData.magicToken} isSubmitting={isSubmitting} csrfToken={csrfToken} />
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
