import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { oneTimeToken } from '@kobato/db/schema/one-time-token'
import { user as userTable } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { __resetSetupTokenForTests, getSetupToken } from '@kobato/server/domains/auth/setup-token'
import { setupRouter } from '@kobato/server/http/controllers/account/setup.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetRateLimitsForTests, tryKeyedRateLimit } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { makeSession } from '@kobato/server/tests/utils/session'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  __resetRateLimitsForTests()
  __resetSetupTokenForTests()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

let ipCounter = 0

function ctxWithSession(
  session: BlogSession,
  opts: { clientAddress?: string; markSessionDirty?: () => void } = {},
): HandlerContext {
  ipCounter += 1
  const base = makePublicCtx({
    db,
    url: 'http://localhost/admin/setup',
    clientAddress: opts.clientAddress ?? `127.0.0.${ipCounter}`,
  })
  return {
    ...base,
    session,
    markSessionDirty: opts.markSessionDirty ?? base.markSessionDirty,
  }
}

function verifiedSession(extra: Record<string, unknown> = {}): BlogSession {
  return makeSession({ csrfToken: 'setup-csrf', setupTokenVerified: true, ...extra })
}

async function tokenRows() {
  return db.select().from(oneTimeToken).where(eq(oneTimeToken.key, 'setup_token'))
}

async function adminRows() {
  return db.select().from(userTable).where(eq(userTable.role, 'admin'))
}

const INSTALL_INPUT = {
  title: 'My Blog',
  name: 'Admin',
  email: 'admin@example.com',
  password: 'CorrectHorse1',
  locale: 'en-US',
}

describe('account setup controller — status', () => {
  it('mints the setup token and answers the anonymous view with the session csrf token', async () => {
    const session = makeSession({ csrfToken: 'setup-csrf' })

    const result = await call(setupRouter.status, {}, { context: ctxWithSession(session) })

    expect(result).toEqual({ setupTokenVerified: false, csrfToken: 'setup-csrf' })
    expect(await tokenRows()).toHaveLength(1)
  })

  it('projects the verified flag from the session', async () => {
    const result = await call(setupRouter.status, {}, { context: ctxWithSession(verifiedSession()) })

    expect(result).toEqual({ setupTokenVerified: true, csrfToken: 'setup-csrf' })
  })
})

describe('account setup controller — verifyToken', () => {
  it('verifies a valid token, stores only the boolean flag, and marks the session dirty', async () => {
    const token = await getSetupToken(db)
    const session = makeSession({ csrfToken: 'setup-csrf' })
    const markSessionDirty = vi.fn()

    const result = await call(
      setupRouter.verifyToken,
      { token },
      { context: ctxWithSession(session, { markSessionDirty }) },
    )

    expect(result).toEqual({ kind: 'verified' })
    expect(session.data.setupTokenVerified).toBe(true)
    expect(session.data).not.toHaveProperty('setupToken')
    expect(markSessionDirty).toHaveBeenCalledTimes(1)
  })

  it('rejects a bogus token without touching the session', async () => {
    await getSetupToken(db)
    const session = makeSession({})
    const markSessionDirty = vi.fn()

    const result = await call(
      setupRouter.verifyToken,
      { token: 'bogus-token' },
      { context: ctxWithSession(session, { markSessionDirty }) },
    )

    expect(result).toMatchObject({
      kind: 'error',
      descriptor: { messageKey: 'auth.setup.error.tokenInvalid' },
    })
    expect(session.data.setupTokenVerified).toBeUndefined()
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('requires a non-empty token before touching the database', async () => {
    const session = makeSession({})

    const result = await call(setupRouter.verifyToken, { token: '' }, { context: ctxWithSession(session) })

    expect(result).toMatchObject({
      kind: 'error',
      descriptor: { messageKey: 'auth.setup.error.tokenRequired' },
    })
  })

  it('answers 429 on the wire once the keyed rate limit is exceeded', async () => {
    const ip = '10.9.9.9'
    await getSetupToken(db)
    for (let i = 0; i < 10; i += 1) {
      await tryKeyedRateLimit(`rate-limit:setup-verify:${ip}`, { windowSeconds: 3600, maxAttempts: 10 })
    }
    const session = makeSession({})
    const markSessionDirty = vi.fn()

    const result = await call(
      setupRouter.verifyToken,
      { token: 'any-token' },
      { context: ctxWithSession(session, { clientAddress: ip, markSessionDirty }) },
    )

    expect(result.kind).toBe('error')
    expect(result).toMatchObject({
      descriptor: { messageKey: 'auth.setup.error.rateLimited' },
      status: 429,
    })
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(session.data.setupTokenVerified).toBeUndefined()
  })
})

describe('account setup controller — install', () => {
  it('installs the first admin, moves the session cookie onto the response headers, and consumes the token', async () => {
    await getSetupToken(db)
    const session = verifiedSession()
    const ctx = ctxWithSession(session)

    const result = await call(setupRouter.install, INSTALL_INPUT, { context: ctx })

    expect(result).toEqual({ type: 'redirect', to: '/admin' })
    expect('setCookie' in result).toBe(false)
    expect(ctx.responseHeaders.get('Set-Cookie')).toMatch(/^__session=/)

    const admins = await adminRows()
    expect(admins).toHaveLength(1)
    expect(admins[0]?.email).toBe('admin@example.com')
    expect(await tokenRows()).toHaveLength(0)
  })

  it('answers tokenNotVerified for an unverified session without touching the database', async () => {
    await getSetupToken(db)
    const session = makeSession({ csrfToken: 'setup-csrf' })

    const result = await call(setupRouter.install, INSTALL_INPUT, { context: ctxWithSession(session) })

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.setup.error.tokenNotVerified' },
    })
    expect(await adminRows()).toHaveLength(0)
  })

  it('answers tokenExpired when the setup token row is no longer live', async () => {
    await db.insert(oneTimeToken).values({
      key: 'setup_token',
      payload: 'expired-token',
      expiresAt: new Date(Date.now() - 1000),
    })

    const result = await call(setupRouter.install, INSTALL_INPUT, {
      context: ctxWithSession(verifiedSession()),
    })

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.setup.error.tokenExpired' },
    })
    expect(await adminRows()).toHaveLength(0)
  })

  it('keeps the signUpAdminSchema field copy instead of a wire BAD_REQUEST', async () => {
    await getSetupToken(db)

    const result = await call(
      setupRouter.install,
      { ...INSTALL_INPUT, email: 'not-an-email', locale: 'fr-FR' },
      { context: ctxWithSession(verifiedSession()) },
    )

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.validation.emailInvalid' },
    })
    expect(await adminRows()).toHaveLength(0)
  })

  it('answers adminExists without re-installing when an admin already exists', async () => {
    await getSetupToken(db)
    await db.insert(userTable).values({
      name: 'Existing',
      email: 'existing@example.com',
      password: 'not-a-real-hash',
      role: 'admin',
    })

    const result = await call(setupRouter.install, INSTALL_INPUT, { context: ctxWithSession(verifiedSession()) })

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.setup.error.adminExists' },
    })
    const admins = await adminRows()
    expect(admins).toHaveLength(1)
    expect(admins[0]?.email).toBe('existing@example.com')
    expect('setCookie' in result).toBe(false)
    expect(await tokenRows()).toHaveLength(1)
  })
})
