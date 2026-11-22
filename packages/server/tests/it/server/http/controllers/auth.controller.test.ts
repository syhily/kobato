import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { auditLog } from '@kobato/db/schema/config'
import { session as sessionTable } from '@kobato/db/schema/session'
import { user as userTable } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { issueResetToken, issueSignInLinkToken } from '@kobato/server/domains/auth/verification-tokens'
import { authRouter } from '@kobato/server/http/controllers/account/auth.controller'
import { isPublicReadRpcPath } from '@kobato/server/http/request/public-read-rpc-path'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { adminUser, makeSession } from '@kobato/server/tests/utils/session'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

const TEST_PASSWORD = 'correcthorsebatterystaple'

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  __resetRateLimitsForTests()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

let ipCounter = 0

function ctxWithSession(
  session: BlogSession,
  opts: { url?: string; markSessionDirty?: () => void } = {},
): HandlerContext {
  ipCounter += 1
  const base = makePublicCtx({
    db,
    url: opts.url ?? 'http://localhost/admin/signin',
    clientAddress: `127.0.0.${ipCounter}`,
  })
  return {
    ...base,
    session,
    viewer: session.get('user') ?? null,
    markSessionDirty: opts.markSessionDirty ?? base.markSessionDirty,
  }
}

async function seedLoginUser(): Promise<number> {
  const rows = await db
    .insert(userTable)
    .values({
      name: 'Admin',
      email: 'admin@example.com',
      emailVerified: true,
      link: '',
      password: await bcrypt.hash(TEST_PASSWORD, 12),
      role: 'admin',
      receiveEmail: true,
    })
    .returning({ id: userTable.id })
  return rows[0]!.id
}

async function auditRowsFor(action: string) {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, action))
}

const STATUS_INPUT = { redirectTo: null, action: null, token: null, error: null }

describe('account auth controller — status', () => {
  it('answers the anonymous default login view with the session csrf token', async () => {
    const session = makeSession({ csrfToken: 'csrf-1' })

    const result = await call(authRouter.status, STATUS_INPUT, { context: ctxWithSession(session) })

    expect(result).toEqual({
      kind: 'view',
      redirectTo: '/',
      action: 'login',
      tokenError: null,
      resetToken: null,
      magicToken: null,
      authError: null,
      csrfToken: 'csrf-1',
    })
  })

  it('redirects an already signed-in viewer and re-sanitizes cross-origin redirect targets', async () => {
    const session = makeSession({ user: adminUser() })

    for (const target of ['https://evil.example/phish', '//evil.example/phish', '/..//evil.example']) {
      const result = await call(
        authRouter.status,
        { ...STATUS_INPUT, redirectTo: target },
        { context: ctxWithSession(session) },
      )
      expect(result, target).toEqual({ kind: 'redirect', to: '/' })
    }
  })

  it('peeks a valid reset token and keeps the view action', async () => {
    const id = await seedLoginUser()
    const { token } = issueResetToken(db, id)
    const session = makeSession({})

    const result = await call(
      authRouter.status,
      { ...STATUS_INPUT, action: 'resetpassword', token },
      { context: ctxWithSession(session) },
    )

    expect(result).toMatchObject({ kind: 'view', action: 'resetpassword', resetToken: token, tokenError: null })
  })

  it('localizes the invalid-token copy for a bogus reset token', async () => {
    await seedLoginUser()
    const session = makeSession({})

    const result = await call(
      authRouter.status,
      { ...STATUS_INPUT, action: 'resetpassword', token: 'bogus-token' },
      { context: ctxWithSession(session) },
    )

    expect(result).toMatchObject({ kind: 'view', resetToken: null, tokenError: '链接无效或已过期。' })
  })

  it('peeks a magic-link token under the magiclink view action', async () => {
    const id = await seedLoginUser()
    const { token } = issueSignInLinkToken(db, id)
    const session = makeSession({})

    const result = await call(
      authRouter.status,
      { ...STATUS_INPUT, action: 'magiclink', token, error: 'invalid_credentials' },
      { context: ctxWithSession(session) },
    )

    expect(result).toMatchObject({
      kind: 'view',
      action: 'magiclink',
      magicToken: token,
      authError: 'invalid_credentials',
    })
  })

  it('answers the verifyotp view while a live pending OTP is staged', async () => {
    const session = makeSession({})
    session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: 1_700_000_000_000,
    })

    const result = await call(authRouter.status, STATUS_INPUT, { context: ctxWithSession(session) })

    expect(result).toMatchObject({
      kind: 'view',
      action: 'verifyotp',
      pendingOtpEmail: 'admin@example.com',
      pendingOtpSentAt: 1_700_000_000_000,
    })
  })

  it('marks the session dirty and redirects to a clean signin once the pending OTP expired', async () => {
    const markSessionDirty = vi.fn()
    const session = makeSession({})
    session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() - 1,
      sentAt: Date.now() - 10 * 60 * 1000,
    })

    const result = await call(
      authRouter.status,
      { ...STATUS_INPUT, redirectTo: '/admin/posts' },
      { context: ctxWithSession(session, { markSessionDirty }) },
    )

    expect(result).toEqual({ kind: 'redirect', to: '/admin/signin?redirect_to=%2Fadmin%2Fposts' })
    expect(markSessionDirty).toHaveBeenCalledTimes(1)
    expect(session.get('pendingOtpUser')).toBeUndefined()
    expect(session.get('otpFailCount')).toBeUndefined()
  })
})

describe('account auth controller — login', () => {
  it('establishes a session, moves the cookie onto the response headers, and re-sanitizes the redirect', async () => {
    const id = await seedLoginUser()
    const session = makeSession({})
    const ctx = ctxWithSession(session)

    const result = await call(
      authRouter.login,
      { email: 'admin@example.com', password: TEST_PASSWORD, redirectTo: 'https://evil.example/phish' },
      { context: ctx },
    )

    expect(result).toEqual({ type: 'redirect', to: '/admin' })
    expect('setCookie' in result).toBe(false)
    expect(ctx.responseHeaders.get('Set-Cookie')).toMatch(/^__session=/)

    const sessions = await db.select().from(sessionTable).where(eq(sessionTable.userId, id))
    expect(sessions).toHaveLength(1)
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.details).toMatchObject({ method: 'password' })
  })

  it('keeps the domain validation error copy instead of a wire BAD_REQUEST', async () => {
    const session = makeSession({})
    const ctx = ctxWithSession(session)

    const result = await call(authRouter.login, { email: '', password: '', redirectTo: null }, { context: ctx })

    expect(result.type).toBe('error')
    expect(result).toMatchObject({ descriptor: { messageKey: 'auth.signin.error.credentialsRequired' } })
    expect(ctx.responseHeaders.get('Set-Cookie')).toBeNull()
  })
})

describe('account auth controller — logout', () => {
  it('destroys the session, audits the logout, and returns the sanitized redirect', async () => {
    const id = await seedLoginUser()
    const session = makeSession({ user: { ...adminUser(), id: String(id) } })
    const ctx = ctxWithSession(session)

    const result = await call(authRouter.logout, { redirectTo: 'https://evil.example/phish' }, { context: ctx })

    expect(result).toEqual({ type: 'redirect', to: '/admin' })
    expect('setCookie' in result).toBe(false)
    expect(ctx.responseHeaders.get('Set-Cookie')).toMatch(/^__session=/)
    expect(session.get('user')).toBeUndefined()
    expect(await auditRowsFor('logout')).toHaveLength(1)
  })

  it('skips the audit event for an anonymous logout', async () => {
    const session = makeSession({})
    const ctx = ctxWithSession(session)

    await call(authRouter.logout, { redirectTo: null }, { context: ctx })

    expect(await auditRowsFor('logout')).toHaveLength(0)
  })
})

describe('account auth controller — csrf guard semantics', () => {
  it('keeps every account.auth procedure on the full CSRF guard (no public-read exemption)', () => {
    expect(isPublicReadRpcPath('/rpc/account/auth/status')).toBe(false)
    expect(isPublicReadRpcPath('/rpc/account/auth/login')).toBe(false)
    expect(isPublicReadRpcPath('/rpc/account/auth/logout')).toBe(false)
    expect(isPublicReadRpcPath('/rpc/account/passkey/auth-finish')).toBe(false)
  })
})

describe('account auth controller — multiple flow cookies stay separate', () => {
  it('accumulates two Set-Cookie entries on one context and a response keeps them un-merged', async () => {
    await seedLoginUser()
    const session = makeSession({})
    const ctx = ctxWithSession(session)

    await call(
      authRouter.login,
      { email: 'admin@example.com', password: TEST_PASSWORD, redirectTo: null },
      { context: ctx },
    )
    await call(authRouter.logout, { redirectTo: null }, { context: ctx })

    const cookies = ctx.responseHeaders.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(new Set(cookies).size).toBe(2)
    expect(cookies.every((cookie) => cookie.startsWith('__session='))).toBe(true)

    const headers = new Headers()
    for (const cookie of cookies) {
      headers.append('Set-Cookie', cookie)
    }
    const response = new Response(null, { status: 302, headers })
    expect(response.headers.getSetCookie()).toEqual(cookies)
    expect(response.headers.getSetCookie()).toHaveLength(2)
  })
})
