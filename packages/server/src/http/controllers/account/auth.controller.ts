import type { AuthSigninViewAction, AuthStatusOutput } from '@kobato/api/contracts/account/auth'
import type { AuthFlowResult } from '@kobato/server/domains/auth/services/shared'

import { AUTH_SIGNIN_VIEW_ACTIONS, AUTH_STATUS_REDIRECT_FALLBACK } from '@kobato/api/contracts/account/auth'
import { accountAuthContract } from '@kobato/api/rpc/account/auth'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { logout } from '@kobato/server/domains/auth/primitives'
import { handleCredentialLogin } from '@kobato/server/domains/auth/services/credential'
import { handleIdentify } from '@kobato/server/domains/auth/services/identify'
import { handleMagicLinkConsume } from '@kobato/server/domains/auth/services/magic-link'
import {
  handleOtpCancel,
  handleOtpResend,
  handleOtpVerify,
  readLivePendingOtp,
} from '@kobato/server/domains/auth/services/otp'
import { requestPasswordReset, resetPasswordWithToken } from '@kobato/server/domains/auth/services/password-reset'
import { authFlowError, authFlowMessage } from '@kobato/server/domains/auth/services/shared'
import { destroySession } from '@kobato/server/domains/auth/session-storage'
import { peekToken } from '@kobato/server/domains/auth/verification-tokens'
import { hasApprovedComments } from '@kobato/server/domains/comments/services/public-query'
import {
  authFlowContext,
  authFlowFormData,
  safeActionRedirect,
  wireAuthFlow,
} from '@kobato/server/http/controllers/account/auth-shared'
import { implementPublic } from '@kobato/server/http/orpc-base'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { safeRedirectPath } from '@kobato/utils/safe-url'

const VIEW_ACTIONS: readonly string[] = AUTH_SIGNIN_VIEW_ACTIONS

function isSigninViewAction(action: string): action is AuthSigninViewAction {
  return VIEW_ACTIONS.includes(action)
}

function sessionCsrfToken(context: { session: { get(key: string): unknown } }): string | null {
  const token = context.session.get('csrfToken')
  return typeof token === 'string' ? token : null
}

const status = implementPublic(accountAuthContract).status.handler(
  async ({ input, context }): Promise<AuthStatusOutput> => {
    const { session, db, viewer, localization } = context
    const redirectTo = safeRedirectPath(input.redirectTo ?? null, AUTH_STATUS_REDIRECT_FALLBACK, context.request.url)
    const action = input.action ?? null

    if (viewer) {
      return { kind: 'redirect', to: redirectTo }
    }

    const invalidToken = authFlowError('auth.signin.error.invalidToken')
    const invalidTokenText = authFlowMessage(invalidToken.message, invalidToken.descriptor, localization.locale)
    let tokenError: string | null = null
    let resetToken: string | null = null
    if (
      (action === 'resetpassword' || action === 'accept-invite') &&
      input.token !== null &&
      input.token !== undefined
    ) {
      if (input.token === '') {
        tokenError = invalidTokenText
      } else {
        const purpose = action === 'resetpassword' ? 'password-reset' : 'author-invite'
        const result = await peekToken(db, input.token, purpose)
        if (result === null) {
          tokenError = invalidTokenText
        } else {
          resetToken = input.token
        }
      }
    }

    let magicToken: string | null = null
    if (action === 'magiclink') {
      if (!input.token) {
        tokenError = invalidTokenText
      } else {
        const result = await peekToken(db, input.token, 'signin-link')
        if (result === null) {
          tokenError = invalidTokenText
        } else {
          magicToken = input.token
        }
      }
    }

    const otpState = readLivePendingOtp(session)
    if (otpState.expired) {
      context.markSessionDirty()
      return { kind: 'redirect', to: `/admin/signin?redirect_to=${encodeURIComponent(redirectTo)}` }
    }
    const pendingOtpUser = otpState.pending
    if (pendingOtpUser) {
      return {
        kind: 'view',
        redirectTo,
        action: 'verifyotp',
        tokenError,
        resetToken,
        magicToken,
        pendingOtpEmail: pendingOtpUser.email,
        pendingOtpSentAt: pendingOtpUser.sentAt,
        authError: input.error ?? null,
        csrfToken: sessionCsrfToken(context),
      }
    }

    return {
      kind: 'view',
      redirectTo,
      action: action !== null && isSigninViewAction(action) ? action : 'login',
      tokenError,
      resetToken,
      magicToken,
      authError: input.error ?? null,
      csrfToken: sessionCsrfToken(context),
    }
  },
)

const identify = implementPublic(accountAuthContract).identify.handler(async ({ input, context }) => {
  const redirectTo = safeActionRedirect(input.redirectTo, context)
  const result = await handleIdentify(
    authFlowContext(context),
    context.request,
    authFlowFormData({ email: input.email }),
    redirectTo,
  )
  switch (result.kind) {
    case 'passkey':
      return { kind: 'passkey' }
    case 'password':
      return { kind: 'password' }
    case 'magic-link-sent': {
      const descriptor = descriptorFor('auth.signin.magicLinkSent')
      return { kind: 'magic-link-sent', message: descriptor.fallbackMessage, descriptor }
    }
    case 'error':
      return {
        kind: 'error',
        message: result.message,
        ...(result.descriptor === undefined ? {} : { descriptor: result.descriptor }),
      }
  }
})

const login = implementPublic(accountAuthContract).login.handler(async ({ input, context }) => {
  const result: AuthFlowResult = await handleCredentialLogin(
    authFlowContext(context),
    context.request,
    authFlowFormData({ email: input.email, password: input.password }),
    safeActionRedirect(input.redirectTo, context),
  )
  return wireAuthFlow(result, context)
})

const logoutFlow = implementPublic(accountAuthContract).logout.handler(async ({ input, context }) => {
  const { session } = context
  const user = session.get('user')
  await logout(session)
  if (user) {
    recordAuditEventFromContext(context, {
      action: 'logout',
      resourceType: 'session',
      resourceId: session.id,
    })
  }
  context.responseHeaders.append('Set-Cookie', await destroySession(session))
  return { type: 'redirect' as const, to: safeActionRedirect(input.redirectTo, context) }
})

const magicLink = implementPublic(accountAuthContract).magicLink.handler(async ({ input, context }) => {
  const result = await handleMagicLinkConsume(
    authFlowContext(context),
    context.request,
    authFlowFormData({ magic_token: input.token }),
    safeActionRedirect(input.redirectTo, context),
  )
  return wireAuthFlow(result, context)
})

const otpVerify = implementPublic(accountAuthContract).otpVerify.handler(async ({ input, context }) => {
  const result = await handleOtpVerify(
    authFlowContext(context),
    context.request,
    authFlowFormData({ otp_code: input.code }),
    safeActionRedirect(input.redirectTo, context),
  )
  return wireAuthFlow(result, context)
})

const otpResend = implementPublic(accountAuthContract).otpResend.handler(async ({ context }) => {
  const result = await handleOtpResend(authFlowContext(context), context.request)
  return wireAuthFlow(result, context)
})

const otpCancel = implementPublic(accountAuthContract).otpCancel.handler(async ({ input, context }) => {
  const result = await handleOtpCancel(authFlowContext(context), safeActionRedirect(input.redirectTo, context))
  return wireAuthFlow(result, context)
})

const passwordResetRequest = implementPublic(accountAuthContract).passwordResetRequest.handler(
  async ({ input, context }) => {
    const result = await requestPasswordReset(
      context.db,
      context.clientAddress,
      context.request,
      authFlowFormData({ email: input.email }),
      { hasApprovedComments },
    )
    return wireAuthFlow(result, context)
  },
)

const passwordReset = implementPublic(accountAuthContract).passwordReset.handler(async ({ input, context }) => {
  const result = await resetPasswordWithToken(
    authFlowContext(context),
    context.request,
    authFlowFormData({ reset_token: input.token, password: input.password }),
    safeActionRedirect(input.redirectTo, context),
    input.purpose,
  )
  return wireAuthFlow(result, context)
})

export const authRouter = implementPublic(accountAuthContract).router({
  status,
  identify,
  login,
  logout: logoutFlow,
  magicLink,
  otpVerify,
  otpResend,
  otpCancel,
  passwordResetRequest,
  passwordReset,
})
