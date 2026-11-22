import { accountContract } from '@kobato/api/account-contract'
import {
  authFlowOutputSchema,
  authIdentifyInput,
  authIdentifyOutputSchema,
  authLoginInput,
  authLogoutInput,
  authMagicLinkInput,
  authOtpCancelInput,
  authOtpResendInput,
  authOtpVerifyInput,
  authPasswordResetInput,
  authPasswordResetRequestInput,
  authStatusInput,
  authStatusOutputSchema,
  passkeyAuthFinishInput,
} from '@kobato/api/contracts/auth'
import {
  commentsMyCountsOutputSchema,
  commentsResolveEntityInputSchema,
  commentsResolveEntityOutputSchema,
  commentIdInputSchema,
  commentLoadMineInputSchema,
  commentLoadMineOutputSchema,
  commentSearchMineEntitiesInputSchema,
  commentSearchMineEntitiesOutputSchema,
  commentUpdateOwnInputSchema,
  ownCommentMutationDto,
} from '@kobato/api/contracts/comments'
import { applyFriendSchema, friendsApplyOutputSchema } from '@kobato/api/contracts/friends'
import {
  newsletterConfirmSchema,
  newsletterOkOutputSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@kobato/api/contracts/newsletter'
import {
  listNotificationsInput,
  listNotificationsOutput,
  markNotificationsReadInput,
  markNotificationsUnreadInput,
  notificationThreadInput,
  notificationThreadOutput,
  replyNotificationInput,
  replyNotificationOutput,
  unreadCountOutput,
} from '@kobato/api/contracts/notifications'
import { successDto } from '@kobato/api/contracts/primitives'
import {
  setupInstallInput,
  setupStatusInput,
  setupStatusOutputSchema,
  setupVerifyTokenInput,
  setupVerifyTokenOutputSchema,
} from '@kobato/api/contracts/setup'
import {
  accountPasskeyDeleteInput,
  accountPasskeyListOutputSchema,
  accountPasskeyRegisterBeginInput,
  accountPasskeyRegisterBeginOutputSchema,
  accountPasskeyRegisterFinishInput,
  accountProfileOutputSchema,
  accountRevokeSessionInput,
  accountRevokeSessionOutputSchema,
  accountSessionsOutputSchema,
  accountSetLoginMethodInput,
  accountUpdatePasswordInput,
  accountUpdateProfileInput,
  accountUpdateProfileOutputSchema,
  passkeyAuthBeginInputSchema,
  passkeyOptionsOutputSchema,
} from '@kobato/api/contracts/users'
import { accountAuthContract } from '@kobato/api/rpc/account/auth'
import { commentsAuthedContract } from '@kobato/api/rpc/account/comments'
import { friendsContract } from '@kobato/api/rpc/account/friends'
import { newsletterContract } from '@kobato/api/rpc/account/newsletter'
import { notificationsContract } from '@kobato/api/rpc/account/notifications'
import { passkeyContract } from '@kobato/api/rpc/account/passkey'
import { accountSelfContract } from '@kobato/api/rpc/account/self'
import { accountSetupContract } from '@kobato/api/rpc/account/setup'
import { type AnyContractProcedure, isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'

interface RouteSpec {
  method: 'GET' | 'POST'
  path: string
  input?: unknown
  output: unknown
}

interface ContractSpec {
  contract: Record<string, unknown>
  routes: Record<string, RouteSpec>
}

const CONTRACT_SPECS: Record<string, ContractSpec> = {
  'account/self': {
    contract: accountSelfContract as unknown as Record<string, unknown>,
    routes: {
      profile: { method: 'GET', path: '/account/profile', output: accountProfileOutputSchema },
      sessions: { method: 'GET', path: '/account/sessions', output: accountSessionsOutputSchema },
      updateProfile: {
        method: 'POST',
        path: '/account/update-profile',
        input: accountUpdateProfileInput,
        output: accountUpdateProfileOutputSchema,
      },
      updatePassword: {
        method: 'POST',
        path: '/account/update-password',
        input: accountUpdatePasswordInput,
        output: successDto,
      },
      revokeSession: {
        method: 'POST',
        path: '/account/revoke-session',
        input: accountRevokeSessionInput,
        output: accountRevokeSessionOutputSchema,
      },
      passkeyList: { method: 'GET', path: '/account/passkeys', output: accountPasskeyListOutputSchema },
      passkeyRegisterBegin: {
        method: 'POST',
        path: '/account/passkeys/register-begin',
        input: accountPasskeyRegisterBeginInput,
        output: accountPasskeyRegisterBeginOutputSchema,
      },
      passkeyRegisterFinish: {
        method: 'POST',
        path: '/account/passkeys/register-finish',
        input: accountPasskeyRegisterFinishInput,
        output: successDto,
      },
      passkeyDelete: {
        method: 'POST',
        path: '/account/passkeys/delete',
        input: accountPasskeyDeleteInput,
        output: successDto,
      },
      setLoginMethod: {
        method: 'POST',
        path: '/account/login-method',
        input: accountSetLoginMethodInput,
        output: successDto,
      },
    },
  },
  'comments/authed': {
    contract: commentsAuthedContract as unknown as Record<string, unknown>,
    routes: {
      updateOwn: {
        method: 'POST',
        path: '/comments/update-own',
        input: commentUpdateOwnInputSchema,
        output: ownCommentMutationDto,
      },
      requestDeleteOwn: {
        method: 'POST',
        path: '/comments/request-delete-own',
        input: commentIdInputSchema,
        output: ownCommentMutationDto,
      },
      cancelDeleteOwn: {
        method: 'POST',
        path: '/comments/cancel-delete-own',
        input: commentIdInputSchema,
        output: ownCommentMutationDto,
      },
      loadMine: {
        method: 'GET',
        path: '/comments/load-mine',
        input: commentLoadMineInputSchema,
        output: commentLoadMineOutputSchema,
      },
      searchMineEntities: {
        method: 'GET',
        path: '/comments/search-mine-entities',
        input: commentSearchMineEntitiesInputSchema,
        output: commentSearchMineEntitiesOutputSchema,
      },
      myCounts: { method: 'GET', path: '/comments/my-counts', output: commentsMyCountsOutputSchema },
      resolveEntity: {
        method: 'GET',
        path: '/comments/resolve-entity',
        input: commentsResolveEntityInputSchema,
        output: commentsResolveEntityOutputSchema,
      },
    },
  },
  friends: {
    contract: friendsContract as unknown as Record<string, unknown>,
    routes: {
      apply: { method: 'POST', path: '/friends/apply', input: applyFriendSchema, output: friendsApplyOutputSchema },
    },
  },
  newsletter: {
    contract: newsletterContract as unknown as Record<string, unknown>,
    routes: {
      subscribe: {
        method: 'POST',
        path: '/newsletter/subscribe',
        input: newsletterSubscribeSchema,
        output: newsletterOkOutputSchema,
      },
      confirm: {
        method: 'POST',
        path: '/newsletter/confirm',
        input: newsletterConfirmSchema,
        output: newsletterOkOutputSchema,
      },
      unsubscribe: {
        method: 'POST',
        path: '/newsletter/unsubscribe',
        input: newsletterUnsubscribeSchema,
        output: newsletterOkOutputSchema,
      },
    },
  },
  notifications: {
    contract: notificationsContract as unknown as Record<string, unknown>,
    routes: {
      list: {
        method: 'GET',
        path: '/notifications/list',
        input: listNotificationsInput,
        output: listNotificationsOutput,
      },
      unreadCount: { method: 'GET', path: '/notifications/unread-count', output: unreadCountOutput },
      markRead: {
        method: 'POST',
        path: '/notifications/mark-read',
        input: markNotificationsReadInput,
        output: unreadCountOutput,
      },
      markUnread: {
        method: 'POST',
        path: '/notifications/mark-unread',
        input: markNotificationsUnreadInput,
        output: unreadCountOutput,
      },
      thread: {
        method: 'GET',
        path: '/notifications/thread',
        input: notificationThreadInput,
        output: notificationThreadOutput,
      },
      reply: {
        method: 'POST',
        path: '/notifications/reply',
        input: replyNotificationInput,
        output: replyNotificationOutput,
      },
    },
  },
  passkey: {
    contract: passkeyContract as unknown as Record<string, unknown>,
    routes: {
      authBegin: {
        method: 'POST',
        path: '/passkey/auth-begin',
        input: passkeyAuthBeginInputSchema,
        output: passkeyOptionsOutputSchema,
      },
      authFinish: {
        method: 'POST',
        path: '/passkey/auth-finish',
        input: passkeyAuthFinishInput,
        output: authFlowOutputSchema,
      },
    },
  },
  auth: {
    contract: accountAuthContract as unknown as Record<string, unknown>,
    routes: {
      status: { method: 'GET', path: '/auth/status', input: authStatusInput, output: authStatusOutputSchema },
      identify: {
        method: 'POST',
        path: '/auth/identify',
        input: authIdentifyInput,
        output: authIdentifyOutputSchema,
      },
      login: { method: 'POST', path: '/auth/login', input: authLoginInput, output: authFlowOutputSchema },
      logout: { method: 'POST', path: '/auth/logout', input: authLogoutInput, output: authFlowOutputSchema },
      magicLink: {
        method: 'POST',
        path: '/auth/magic-link',
        input: authMagicLinkInput,
        output: authFlowOutputSchema,
      },
      otpVerify: {
        method: 'POST',
        path: '/auth/otp/verify',
        input: authOtpVerifyInput,
        output: authFlowOutputSchema,
      },
      otpResend: {
        method: 'POST',
        path: '/auth/otp/resend',
        input: authOtpResendInput,
        output: authFlowOutputSchema,
      },
      otpCancel: {
        method: 'POST',
        path: '/auth/otp/cancel',
        input: authOtpCancelInput,
        output: authFlowOutputSchema,
      },
      passwordResetRequest: {
        method: 'POST',
        path: '/auth/password-reset/request',
        input: authPasswordResetRequestInput,
        output: authFlowOutputSchema,
      },
      passwordReset: {
        method: 'POST',
        path: '/auth/password-reset',
        input: authPasswordResetInput,
        output: authFlowOutputSchema,
      },
    },
  },
  setup: {
    contract: accountSetupContract as unknown as Record<string, unknown>,
    routes: {
      status: { method: 'GET', path: '/setup/status', input: setupStatusInput, output: setupStatusOutputSchema },
      verifyToken: {
        method: 'POST',
        path: '/setup/verify-token',
        input: setupVerifyTokenInput,
        output: setupVerifyTokenOutputSchema,
      },
      install: { method: 'POST', path: '/setup/install', input: setupInstallInput, output: authFlowOutputSchema },
    },
  },
}

function procedures(router: Record<string, unknown>): Record<string, AnyContractProcedure> {
  return router as Record<string, AnyContractProcedure>
}

describe('account contract shapes', () => {
  it.each(Object.entries(CONTRACT_SPECS))('%s exposes exactly its deployed procedures', (_name, spec) => {
    expect(Object.keys(spec.contract)).toEqual(Object.keys(spec.routes))
    for (const procedure of Object.values(spec.contract)) {
      expect(isContractProcedure(procedure)).toBe(true)
    }
  })

  it.each(Object.entries(CONTRACT_SPECS))('%s pins every method and path', (_name, spec) => {
    const procs = procedures(spec.contract)
    for (const [key, route] of Object.entries(spec.routes)) {
      expect(procs[key]['~orpc'].route, `${key} route`).toEqual({ method: route.method, path: route.path })
    }
  })

  it.each(Object.entries(CONTRACT_SPECS))('%s composes the contracts schemas by reference', (_name, spec) => {
    const procs = procedures(spec.contract)
    for (const [key, route] of Object.entries(spec.routes)) {
      if (route.input !== undefined) {
        expect(procs[key]['~orpc'].inputSchema, `${key} input`).toBe(route.input)
      } else {
        expect(procs[key]['~orpc'].inputSchema, `${key} has no input schema`).toBeUndefined()
      }
      expect(procs[key]['~orpc'].outputSchema, `${key} output`).toBe(route.output)
    }
  })
})

describe('accountContract composition', () => {
  it('spreads the self procedures at the account root and mounts the sub-trees', () => {
    expect(Object.keys(accountContract)).toEqual([
      ...Object.keys(accountSelfContract),
      'auth',
      'setup',
      'comments',
      'notifications',
      'passkey',
      'likes',
      'friends',
      'newsletter',
    ])
    expect(accountContract.profile).toBe(accountSelfContract.profile)
    expect(accountContract.auth).toBe(accountAuthContract)
    expect(accountContract.setup).toBe(accountSetupContract)
    expect(accountContract.comments).toBe(commentsAuthedContract)
    expect(accountContract.notifications).toBe(notificationsContract)
    expect(accountContract.passkey).toBe(passkeyContract)
    expect(accountContract.friends).toBe(friendsContract)
    expect(accountContract.newsletter).toBe(newsletterContract)
  })
})

describe('account contracts schema sanity (spot checks)', () => {
  it('keeps the update-password policy wired into the account input', () => {
    expect(accountUpdatePasswordInput.safeParse({ oldPassword: 'x', newPassword: 'short' }).success).toBe(false)
    expect(accountUpdatePasswordInput.safeParse({ oldPassword: 'x', newPassword: 'CorrectHorse1' }).success).toBe(true)
  })

  it('auth inputs accept unvalidated strings so the domain services keep owning form error copy', () => {
    expect(authLoginInput.safeParse({ email: '', password: '' }).success).toBe(true)
    expect(authStatusInput.safeParse({}).success).toBe(true)
    expect(
      authStatusInput.safeParse({ redirectTo: null, action: 'resetpassword', token: 't', error: null }).success,
    ).toBe(true)
    expect(authPasswordResetInput.safeParse({ token: '', password: '' }).success).toBe(true)
    expect(authPasswordResetInput.parse({ token: 't', password: 'p' }).purpose).toBe('password-reset')
  })

  it('auth outputs are discriminated unions without any cookie payload', () => {
    expect(authFlowOutputSchema.safeParse({ type: 'redirect', to: '/admin' }).success).toBe(true)
    expect(
      authFlowOutputSchema.safeParse({
        type: 'error',
        message: 'nope',
        descriptor: { messageKey: 'error.api.rawMessage', fallbackMessage: 'nope' },
      }).success,
    ).toBe(true)
    expect(authFlowOutputSchema.parse({ type: 'redirect', to: '/admin', setCookie: '__session=x' })).toEqual({
      type: 'redirect',
      to: '/admin',
    })
    expect(authStatusOutputSchema.safeParse({ kind: 'redirect', to: '/' }).success).toBe(true)
    expect(
      authStatusOutputSchema.safeParse({
        kind: 'view',
        redirectTo: '/',
        action: 'login',
        tokenError: null,
        resetToken: null,
        magicToken: null,
        authError: null,
        csrfToken: null,
      }).success,
    ).toBe(true)
    expect(authStatusOutputSchema.safeParse({ kind: 'view', action: 'login' }).success).toBe(false)
  })

  it('setup inputs stay permissive so signUpAdminSchema owns the install error copy', () => {
    expect(
      setupInstallInput.safeParse({ title: '', name: '', email: 'not-an-email', password: '', locale: 'fr-FR' })
        .success,
    ).toBe(true)
    expect(setupInstallInput.safeParse({ title: '', name: '', email: '', password: '' }).success).toBe(true)
    expect(setupVerifyTokenInput.safeParse({ token: '' }).success).toBe(true)
    expect(setupVerifyTokenOutputSchema.safeParse({ kind: 'verified' }).success).toBe(true)
    expect(
      setupVerifyTokenOutputSchema.safeParse({
        kind: 'error',
        message: 'slow down',
        descriptor: { messageKey: 'auth.setup.error.rateLimited', fallbackMessage: 'slow down' },
        status: 429,
      }).success,
    ).toBe(true)
    expect(setupVerifyTokenOutputSchema.safeParse({ kind: 'error', message: 'x', status: 500 }).success).toBe(false)
    expect(setupStatusOutputSchema.safeParse({ setupTokenVerified: false, csrfToken: null }).success).toBe(true)
  })
})
