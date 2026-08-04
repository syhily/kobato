import type { AuthFlowResult } from '@kobato/server/domains/auth/services/shared'

import { validateCsrfForAction } from '@kobato/server/domains/auth/csrf'
import { signInWithPasskey } from '@kobato/server/domains/auth/passkey/signin'
import { handleCredentialLogin } from '@kobato/server/domains/auth/services/credential'
import { handleIdentify } from '@kobato/server/domains/auth/services/identify'
import { handleMagicLinkConsume } from '@kobato/server/domains/auth/services/magic-link'
import { handleOtpCancel, handleOtpResend, handleOtpVerify } from '@kobato/server/domains/auth/services/otp'
import { requestPasswordReset, resetPasswordWithToken } from '@kobato/server/domains/auth/services/password-reset'
import { hasApprovedComments } from '@kobato/server/domains/comments/services/public-query'
import { ensureInstalledOrRedirect } from '@kobato/server/domains/settings/install-gate'
import { loadSigninData } from '@kobato/server/http/loaders/signin'
import { getRequestContext } from '@kobato/server/http/request-context'
import { serverConfig } from '@kobato/server/infra/config'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { LoginForm } from '@kobato/ui/admin/auth/AdminCredentialsForm'
import { LostPasswordForm } from '@kobato/ui/admin/auth/LostPasswordForm'
import { MagicLinkConfirmForm } from '@kobato/ui/admin/auth/MagicLinkConfirmForm'
import { OtpForm } from '@kobato/ui/admin/auth/OtpForm'
import { ResetPasswordForm } from '@kobato/ui/admin/auth/ResetPasswordForm'
import { BrandLogo } from '@kobato/ui/public/chrome/BrandLogo'
import { data, redirect, useNavigation } from 'react-router'

import { resolveLoginRedirect, toSessionBridgedRedirect as sessionBridgedRedirect } from '@/routes/auth/signin-redirect'

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

/**
 * Cross-domain login handoff (headless stage 3, plan v6 §6): when the
 * login redirect target is one of the configured frontend origins
 * (`api.allowedOrigins`), the signed `__session` cookie VALUE rides the
 * redirect URL as `?session_token=…`. The frontend's root loader picks it
 * up, mirrors it into its own-domain `__session` cookie, and redirects to
 * the clean URL; its /rpc proxy then relays it as
 * `X-Kobato-Session-Token` (resolved by core only behind a valid frontend
 * JWT — see `frontendKeyAuth`). The pure helpers live in
 * `./signin-redirect`; this route wires them to the config.
 */
function toSessionBridgedRedirect(to: string, setCookie: string | undefined, origin: string): string {
  return sessionBridgedRedirect(to, setCookie, origin, serverConfig.api.allowedOrigins)
}

function toActionResult(result: AuthFlowResult, extraData?: Record<string, unknown>, origin?: string) {
  const headers: Record<string, string> = {}
  if (result.setCookie) {
    headers['Set-Cookie'] = result.setCookie
  }
  switch (result.type) {
    case 'redirect':
      return redirect(
        origin === undefined ? result.to : toSessionBridgedRedirect(result.to, result.setCookie, origin),
        {
          headers,
        },
      )
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
  const redirectTo = resolveLoginRedirect(
    url.searchParams.get('redirect_to'),
    '/admin',
    url.origin,
    serverConfig.api.allowedOrigins,
  )
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
    return toActionResult(
      await resetPasswordWithToken(rc, request, formData, redirectTo, purpose),
      undefined,
      url.origin,
    )
  }

  if (action === 'cancelotp') {
    return toActionResult(await handleOtpCancel(rc, redirectTo))
  }

  if (action === 'verifyotp') {
    return toActionResult(await handleOtpVerify(rc, request, formData, redirectTo), undefined, url.origin)
  }

  if (action === 'resendotp') {
    return toActionResult(await handleOtpResend(rc, request))
  }

  if (action === 'passkey') {
    return toActionResult(await signInWithPasskey(rc, request, formData, redirectTo), undefined, url.origin)
  }

  if (action === 'identify') {
    const result = await handleIdentify(rc, request, formData, redirectTo, url.origin)
    switch (result.kind) {
      case 'passkey':
        return data({ method: 'passkey' as const })
      case 'password':
        return data({ method: 'password' as const })
      case 'magic-link-sent':
        // Deliberately generic — never reveals whether the mailbox is registered.
        return data({ message: '如果该邮箱已注册，登录链接已发送，请查收邮箱。' })
      case 'error':
        return data({ error: result.message })
    }
  }

  if (action === 'magiclink') {
    return toActionResult(await handleMagicLinkConsume(rc, request, formData, redirectTo), undefined, url.origin)
  }

  return toActionResult(
    await handleCredentialLogin(rc, request, formData, redirectTo),
    {
      redirectTo,
    },
    url.origin,
  )
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
