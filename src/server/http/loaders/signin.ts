import type { LoaderFunctionArgs } from 'react-router'

import { data, redirect } from 'react-router'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { logout } from '@/server/domains/auth/primitives'
import { readLivePendingOtp } from '@/server/domains/auth/services/otp'
import { destroySession } from '@/server/domains/auth/session-storage'
import { peekToken } from '@/server/domains/auth/verification-tokens'
import { ensureInstalledOrRedirect } from '@/server/domains/settings/install-gate'
import { getRequestContext } from '@/server/http/request-context'
import { safeRedirectPath } from '@/shared/utils/safe-url'

// Flow routing behind `routes/auth/signin.tsx`: logout, token peek, and
// OTP-session branching. Redirects are thrown; two `data(...)` payload
// shapes drive the login/verify-otp/lost-password/reset-password forms.

// Only these URL actions name a GET view; any other action is a POST
// handler — treating those as views would unmount the login form on revalidation.
const VIEW_ACTIONS = new Set(['magiclink', 'lostpassword', 'resetpassword', 'accept-invite'])
export async function loadSigninData({ request, context }: Pick<LoaderFunctionArgs, 'request' | 'context'>) {
  const rc = getRequestContext({ request, context })
  const db = rc.db
  await ensureInstalledOrRedirect(db)

  const { session, url } = rc
  const user = rc.viewer
  const redirectTo = safeRedirectPath(url.searchParams.get('redirect_to'), '/', url.origin)
  const action = url.searchParams.get('action')

  if (action === 'logout') {
    const user = session.get('user')
    await logout(session)
    if (user) {
      recordAuditEventFromContext(rc, {
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

  // Surface token errors on the loader so the UI short-circuits before a
  // new password is typed; `peekToken` is read-only — the action consumes it.
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

  // Magic-link landing: same peek-then-confirm pattern — the GET only
  // validates the token (mail scanners must not consume it); the POST
  // from the confirm form consumes it.
  let magicToken: string | null = null
  if (action === 'magiclink') {
    const rawToken = url.searchParams.get('token')
    if (!rawToken) {
      tokenError = '链接无效或已过期。'
    } else {
      const result = await peekToken(db, rawToken, 'signin-link')
      if (result === null) {
        tokenError = '链接无效或已过期。'
      } else {
        magicToken = rawToken
      }
    }
  }

  // OTP pending state: the domain owns the session keys and the expiry
  // rule — the loader only consumes the projection.
  const otpState = readLivePendingOtp(session)
  if (otpState.expired) {
    // The expired pending entry was just cleared from the session — mark
    // dirty and let the middleware commit, instead of carrying an explicit
    // Set-Cookie on the redirect.
    rc.markSessionDirty()
    throw redirect(`/admin/signin?redirect_to=${encodeURIComponent(redirectTo)}`)
  }
  const pendingOtpUser = otpState.pending
  if (pendingOtpUser) {
    return data({
      redirectTo,
      action: 'verifyotp',
      tokenError,
      resetToken,
      magicToken,
      pendingOtpEmail: pendingOtpUser.email,
      pendingOtpSentAt: pendingOtpUser.sentAt,
      authError: url.searchParams.get('error'),
      csrfToken: session.get('csrfToken'),
    })
  }

  const authError = url.searchParams.get('error')
  return data({
    redirectTo,
    action: action !== null && VIEW_ACTIONS.has(action) ? action : 'login',
    tokenError,
    resetToken,
    magicToken,
    authError,
    csrfToken: session.get('csrfToken'),
  })
}
