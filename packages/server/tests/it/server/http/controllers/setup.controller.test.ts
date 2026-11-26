import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { upsertOneTimeToken } from '@kobato/db/sqlite/operations/identity/otp'
import { oneTimeToken } from '@kobato/db/sqlite/schema/one-time-token'
import { user as userTable } from '@kobato/db/sqlite/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import {
  __resetSetupTokenForTests,
  getSetupToken,
  setupTokenFingerprint,
} from '@kobato/server/domains/auth/setup-token'
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

function verifiedSessionFor(token: string, extra: Record<string, unknown> = {}): BlogSession {
  return makeSession({
    csrfToken: 'setup-csrf',
    setupTokenVerified: true,
    setupTokenVerifiedFor: setupTokenFingerprint(token),
    ...extra,
  })
}

async function replaceLiveToken(payload: string): Promise<unknown> {
  return upsertOneTimeToken(db, {
    key: 'setup_token',
    payload,
    expiresAt: new Date(Date.now() + 60_000),
  })
}

async function tokenRows() {
  return sqliteOf(db).select().from(oneTimeToken).where(eq(oneTimeToken.key, 'setup_token'))
}

async function adminRows() {
  return sqliteOf(db).select().from(userTable).where(eq(userTable.role, 'admin'))
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

  it('reports verified only for a flag bound to the live token fingerprint', async () => {
    const token = await getSetupToken(db)
    const session = makeSession({ csrfToken: 'setup-csrf' })
    await call(setupRouter.verifyToken, { token }, { context: ctxWithSession(session) })

    const verified = await call(setupRouter.status, {}, { context: ctxWithSession(session) })
    expect(verified.setupTokenVerified).toBe(true)

    await replaceLiveToken('re-minted-token')
    const sessionForStaleToken = verifiedSessionFor(token)
    const stale = await call(setupRouter.status, {}, { context: ctxWithSession(sessionForStaleToken) })
    expect(stale.setupTokenVerified).toBe(false)
  })

  it('reports unverified for a bare session flag without a fingerprint', async () => {
    const session = makeSession({ csrfToken: 'setup-csrf', setupTokenVerified: true })

    const result = await call(setupRouter.status, {}, { context: ctxWithSession(session) })

    expect(result.setupTokenVerified).toBe(false)
  })
})

describe('account setup controller — verifyToken', () => {
  it('verifies a valid token, stores the flag with the token fingerprint, and marks the session dirty', async () => {
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
    expect(session.data.setupTokenVerifiedFor).toBe(setupTokenFingerprint(token))
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
    const token = await getSetupToken(db)
    const session = verifiedSessionFor(token)
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

  it('answers tokenExpired when the setup token row is no longer live and clears the stale flag', async () => {
    await sqliteOf(db)
      .insert(oneTimeToken)
      .values({
        key: 'setup_token',
        payload: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
      })

    const session = verifiedSessionFor('expired-token')
    const markSessionDirty = vi.fn()
    const result = await call(setupRouter.install, INSTALL_INPUT, {
      context: ctxWithSession(session, { markSessionDirty }),
    })

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.setup.error.tokenExpired' },
    })
    expect(session.data.setupTokenVerified).toBeUndefined()
    expect(session.data.setupTokenVerifiedFor).toBeUndefined()
    expect(markSessionDirty).toHaveBeenCalled()
    expect(await adminRows()).toHaveLength(0)
  })

  it('answers tokenExpired when a different live token was re-minted after verification', async () => {
    const staleToken = await getSetupToken(db)
    const session = verifiedSessionFor(staleToken)
    await replaceLiveToken('re-minted-token')

    const result = await call(setupRouter.install, INSTALL_INPUT, { context: ctxWithSession(session) })

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.setup.error.tokenExpired' },
    })
    expect(session.data.setupTokenVerified).toBeUndefined()
    expect(await adminRows()).toHaveLength(0)
  })

  it('rejects a bare session flag without a fingerprint', async () => {
    await getSetupToken(db)
    const session = makeSession({ csrfToken: 'setup-csrf', setupTokenVerified: true })

    const result = await call(setupRouter.install, INSTALL_INPUT, { context: ctxWithSession(session) })

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.setup.error.tokenExpired' },
    })
    expect(session.data.setupTokenVerified).toBeUndefined()
    expect(await adminRows()).toHaveLength(0)
  })

  it('keeps the signUpAdminSchema field copy instead of a wire BAD_REQUEST', async () => {
    const token = await getSetupToken(db)

    const result = await call(
      setupRouter.install,
      { ...INSTALL_INPUT, email: 'not-an-email', locale: 'fr-FR' },
      { context: ctxWithSession(verifiedSessionFor(token)) },
    )

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.validation.emailInvalid' },
    })
    expect(await adminRows()).toHaveLength(0)
  })

  it('answers adminExists without re-installing when an admin already exists', async () => {
    const token = await getSetupToken(db)
    await sqliteOf(db).insert(userTable).values({
      name: 'Existing',
      email: 'existing@example.com',
      password: 'not-a-real-hash',
      role: 'admin',
    })

    const result = await call(setupRouter.install, INSTALL_INPUT, {
      context: ctxWithSession(verifiedSessionFor(token)),
    })

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

describe('account setup controller — token lifetime binds the verified session', () => {
  function expireTokenRow(): void {
    void upsertOneTimeToken(db, {
      key: 'setup_token',
      payload: 'irrelevant',
      expiresAt: new Date(Date.now() - 1000),
    })
  }

  it('expires the verified session when the token lapses, then re-verification with the re-minted token installs', async () => {
    const firstToken = await getSetupToken(db)
    const session = makeSession({ csrfToken: 'setup-csrf' })
    await call(setupRouter.verifyToken, { token: firstToken }, { context: ctxWithSession(session) })

    expireTokenRow()

    const lapsedStatus = await call(setupRouter.status, {}, { context: ctxWithSession(session) })
    expect(lapsedStatus.setupTokenVerified).toBe(false)

    const rejected = await call(setupRouter.install, INSTALL_INPUT, { context: ctxWithSession(session) })
    expect(rejected).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.setup.error.tokenExpired' },
    })
    expect(await adminRows()).toHaveLength(0)

    const secondToken = 're-minted-token'
    await replaceLiveToken(secondToken)
    await call(setupRouter.verifyToken, { token: secondToken }, { context: ctxWithSession(session) })

    const freshStatus = await call(setupRouter.status, {}, { context: ctxWithSession(session) })
    expect(freshStatus.setupTokenVerified).toBe(true)

    const installed = await call(setupRouter.install, INSTALL_INPUT, { context: ctxWithSession(session) })
    expect(installed).toEqual({ type: 'redirect', to: '/admin' })
    expect(await adminRows()).toHaveLength(1)
    expect(await tokenRows()).toHaveLength(0)
  })
})
