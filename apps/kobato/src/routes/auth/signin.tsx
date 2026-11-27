import type { AuthFlowOutput } from '@kobato/api/contracts/account/auth'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { orpc } from '@kobato/api/browser/client'
import { AUTH_ACTION_REDIRECT_FALLBACK } from '@kobato/api/contracts/account/auth'
import { BrandLogo } from '@kobato/ui/components/BrandLogo'
import { useI18n, type I18nValue } from '@kobato/ui/lib/I18nProvider'
import { safeRedirectPath } from '@kobato/utils/safe-url'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { data, redirect, useNavigation } from 'react-router'

import {
  authErrorPayload,
  authMessagePayload,
  isCsrfFailure,
  toClientActionResult,
  clientAuthFlowError,
  type ClientI18nCatalog,
} from '@/lib/client-action-result'
import { awaitRootBootstrap } from '@/lib/root-bootstrap'
import { formField } from '@/routes/auth/flow-response'
import { titleMeta } from '@/seo/title-meta'
import { type LoginActionData, LoginForm } from '@/ui/auth/AdminCredentialsForm'
import { LostPasswordForm } from '@/ui/auth/LostPasswordForm'
import { MagicLinkConfirmForm } from '@/ui/auth/MagicLinkConfirmForm'
import { OtpForm } from '@/ui/auth/OtpForm'
import { ResetPasswordForm } from '@/ui/auth/ResetPasswordForm'

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

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  if (boot.installState === 'noAdmin') {
    throw redirect('/admin/setup', { status: 303 })
  }
  const url = new URL(request.url)
  const result = await orpc.account.auth.status({
    redirectTo: url.searchParams.get('redirect_to'),
    action: url.searchParams.get('action'),
    token: url.searchParams.get('token'),
    error: url.searchParams.get('error'),
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

export async function clientAction({ request }: Route.ClientActionArgs) {
  const boot = await awaitRootBootstrap()
  const catalog: ClientI18nCatalog = { locale: boot.i18n.locale, messages: boot.i18n.messages }
  if (boot.installState === 'noAdmin') {
    throw redirect('/admin/setup', { status: 303 })
  }
  const url = new URL(request.url)
  const redirectTo = url.searchParams.get('redirect_to')
  const action = url.searchParams.get('action')

  const formData = await request.formData()

  const dispatchFlow = async (run: () => Promise<AuthFlowOutput>, extraData?: Record<string, unknown>) => {
    let result: AuthFlowOutput
    try {
      result = await run()
    } catch (error) {
      if (!isCsrfFailure(error)) {
        throw error
      }
      return toClientActionResult(clientAuthFlowError('error.api.csrfFailed'), catalog)
    }
    return toClientActionResult(result, catalog, extraData)
  }

  if (action === 'lostpassword') {
    return dispatchFlow(() => orpc.account.auth.passwordResetRequest({ email: formField(formData, 'email') }))
  }

  if (action === 'resetpassword' || action === 'accept-invite') {
    return dispatchFlow(() =>
      orpc.account.auth.passwordReset({
        token: formField(formData, 'reset_token'),
        password: formField(formData, 'password'),
        purpose: action === 'resetpassword' ? 'password-reset' : 'author-invite',
        redirectTo,
      }),
    )
  }

  if (action === 'cancelotp') {
    return dispatchFlow(() => orpc.account.auth.otpCancel({ redirectTo }))
  }

  if (action === 'verifyotp') {
    return dispatchFlow(() => orpc.account.auth.otpVerify({ code: formField(formData, 'otp_code'), redirectTo }))
  }

  if (action === 'resendotp') {
    return dispatchFlow(() => orpc.account.auth.otpResend({}))
  }

  if (action === 'passkey') {
    return dispatchFlow(() =>
      orpc.account.passkey.authFinish({
        response: formField(formData, 'passkey_response'),
        challenge: formField(formData, 'passkey_challenge'),
        redirectTo,
      }),
    )
  }

  if (action === 'identify') {
    const result = await orpc.account.auth.identify({ email: formField(formData, 'email'), redirectTo })
    switch (result.kind) {
      case 'passkey':
        return data<LoginActionData>({ method: 'passkey' })
      case 'password':
        return data<LoginActionData>({ method: 'password' })
      case 'magic-link-sent':
        return data(authMessagePayload(result.message, result.descriptor, catalog))
      case 'error':
        return data(authErrorPayload(result.message, result.descriptor, catalog))
    }
  }

  if (action === 'magiclink') {
    return dispatchFlow(() => orpc.account.auth.magicLink({ token: formField(formData, 'magic_token'), redirectTo }))
  }

  return dispatchFlow(
    () =>
      orpc.account.auth.login({
        email: formField(formData, 'email'),
        password: formField(formData, 'password'),
        redirectTo,
      }),
    { redirectTo: safeRedirectPath(redirectTo, AUTH_ACTION_REDIRECT_FALLBACK, url.origin) },
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
