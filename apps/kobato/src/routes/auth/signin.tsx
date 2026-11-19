import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { AuthFlowResult } from '@kobato/server/domains/auth/services/shared.ts'

import { validateCsrfForAction } from '@kobato/server/domains/auth/csrf.ts'
import { signInWithPasskey } from '@kobato/server/domains/auth/passkey/signin.ts'
import { handleCredentialLogin } from '@kobato/server/domains/auth/services/credential.ts'
import { handleIdentify } from '@kobato/server/domains/auth/services/identify.ts'
import { handleMagicLinkConsume } from '@kobato/server/domains/auth/services/magic-link.ts'
import { handleOtpCancel, handleOtpResend, handleOtpVerify } from '@kobato/server/domains/auth/services/otp.ts'
import { requestPasswordReset, resetPasswordWithToken } from '@kobato/server/domains/auth/services/password-reset.ts'
import { authFlowError, authFlowMessage, authFlowSuccess } from '@kobato/server/domains/auth/services/shared.ts'
import { hasApprovedComments } from '@kobato/server/domains/comments/services/public-query.ts'
import { ensureInstalledOrRedirect } from '@kobato/server/domains/settings/install-gate.ts'
import { handleSigninLogout, loadSigninData } from '@kobato/server/http/loaders/signin.ts'
import { getRequestContext } from '@kobato/server/http/request-context.ts'
import { useI18n, type I18nValue } from '@kobato/ui/lib/I18nProvider.tsx'
import { safeRedirectPath } from '@kobato/utils/safe-url.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { LoginForm } from '@kobato/web-admin/ui/auth/AdminCredentialsForm.tsx'
import { LostPasswordForm } from '@kobato/web-admin/ui/auth/LostPasswordForm.tsx'
import { MagicLinkConfirmForm } from '@kobato/web-admin/ui/auth/MagicLinkConfirmForm.tsx'
import { OtpForm } from '@kobato/web-admin/ui/auth/OtpForm.tsx'
import { ResetPasswordForm } from '@kobato/web-admin/ui/auth/ResetPasswordForm.tsx'
import { BrandLogo } from '@kobato/web-public/ui/chrome/BrandLogo.tsx'
import { data, redirect, useNavigation } from 'react-router'

import { titleMeta } from '@/seo/title-meta.ts'

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

function toActionResult(result: AuthFlowResult, locale: AppLocale, extraData?: Record<string, unknown>) {
  const headers: Record<string, string> = {}
  if (result.setCookie) {
    headers['Set-Cookie'] = result.setCookie
  }
  switch (result.type) {
    case 'redirect':
      return redirect(result.to, { headers })
    case 'error':
      return data(
        {
          error: authFlowMessage(result.message, result.descriptor, locale),
          ...(result.descriptor === undefined ? {} : { errorDescriptor: result.descriptor }),
          ...extraData,
        },
        { headers },
      )
    case 'success':
      return data(
        {
          message: authFlowMessage(result.message, result.descriptor, locale),
          ...(result.descriptor === undefined ? {} : { messageDescriptor: result.descriptor }),
          ...extraData,
        },
        { headers },
      )
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  return loadSigninData({ request, context })
}

export async function action({ request, context }: Route.ActionArgs) {
  const rc = getRequestContext({ request, context })
  const locale = rc.localization.locale
  const db = rc.db
  await ensureInstalledOrRedirect(db)

  const { session, clientAddress, url } = rc
  const redirectTo = safeRedirectPath(url.searchParams.get('redirect_to'), '/admin', url.origin)
  const action = url.searchParams.get('action')

  const formData = await request.formData()

  if (!validateCsrfForAction(session, request, formData)) {
    return toActionResult(authFlowError('error.api.csrfFailed'), locale)
  }

  if (action === 'logout') {
    return handleSigninLogout(rc, redirectTo)
  }

  if (action === 'lostpassword') {
    // Wire the comments domain's "established commenter" check in here so the
    // auth domain itself stays free of the comments import.
    return toActionResult(
      await requestPasswordReset(db, clientAddress, request, formData, { hasApprovedComments }),
      locale,
    )
  }

  if (action === 'resetpassword' || action === 'accept-invite') {
    const purpose = action === 'resetpassword' ? 'password-reset' : 'author-invite'
    return toActionResult(await resetPasswordWithToken(rc, request, formData, redirectTo, purpose), locale)
  }

  if (action === 'cancelotp') {
    return toActionResult(await handleOtpCancel(rc, redirectTo), locale)
  }

  if (action === 'verifyotp') {
    return toActionResult(await handleOtpVerify(rc, request, formData, redirectTo), locale)
  }

  if (action === 'resendotp') {
    return toActionResult(await handleOtpResend(rc, request), locale)
  }

  if (action === 'passkey') {
    return toActionResult(await signInWithPasskey(rc, request, formData, redirectTo), locale)
  }

  if (action === 'identify') {
    const result = await handleIdentify(rc, request, formData, redirectTo)
    switch (result.kind) {
      case 'passkey':
        return data({ method: 'passkey' as const })
      case 'password':
        return data({ method: 'password' as const })
      case 'magic-link-sent':
        // Deliberately generic — never reveals whether the mailbox is registered.
        return toActionResult(authFlowSuccess('auth.signin.magicLinkSent'), locale)
      case 'error':
        return toActionResult(
          {
            type: 'error',
            message: result.message,
            ...(result.descriptor === undefined ? {} : { descriptor: result.descriptor }),
          },
          locale,
        )
    }
  }

  if (action === 'magiclink') {
    return toActionResult(await handleMagicLinkConsume(rc, request, formData, redirectTo), locale)
  }

  return toActionResult(await handleCredentialLogin(rc, request, formData, redirectTo), locale, { redirectTo })
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
