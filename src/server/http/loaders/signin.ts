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

// The signin page's flow routing behind `routes/auth/signin.tsx`: the
// logout branch, the reset/accept-invite token peek, and the OTP-session
// branching all live here — the route module keeps context extraction,
// this one call, and rendering. Redirects are thrown (logout, already
// signed-in, expired OTP); the two `data(...)` payload shapes drive the
// login / verify-otp / lost-password / reset-password forms.

// Only these URL actions name a GET view. Every other action name is a
// POST handler (identify, passkey, verifyotp, …) — the router navigates
// to the submitted form's action URL, so the loader revalidates against
// e.g. `?action=identify` right after the identify round-trip. Treating
// those names as views would unmount the login form the instant that
// revalidation commits; they must fall back to the login view instead.
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

  // For reset / invite, surface a token error on the loader so the UI
  // can short-circuit before the user types a new password. `peekToken`
  // is read-only on purpose — the route's action consumes the token
  // only after the form is submitted.
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
