import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@kobato/shared/config/types'
import type { Mock } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { makeSession } from '#/_helpers/session'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { auditLog } from '@kobato/server/infra/db/schema/config'
import { session as sessionTable } from '@kobato/server/infra/db/schema/session'
import { user, verification } from '@kobato/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock handles ────────────────────────────────────────────────────────────
//
// Everything runs REAL except the two sanctioned doubles: the
// request-context seam and email DELIVERY (a true external that doubles
// as the plaintext magic-link token extraction channel). The install gate
// reads the real `user` table (a gate admin is seeded per test), CSRF is
// the real session-token check, establishLoginSession runs for real
// (asserted via the session table + the real Set-Cookie), and audit
// events land in `audit_log` through the real batcher (asserted after a
// flush).

const mockHandles = vi.hoisted(() => ({
  getRequestContext: vi.fn<any>(),
  sendSignInLink: vi.fn<any>(),
}))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@kobato/server/http/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/http/request-context')>()
  return {
    ...actual,
    getRequestContext: mockHandles.getRequestContext,
  }
})

vi.mock('@kobato/server/infra/email/sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/infra/email/sender')>()
  return {
    ...actual,
    sendSignInLink: mockHandles.sendSignInLink,
  }
})

// ── Real infrastructure ─────────────────────────────────────────────────────

const db = getTestDb()

const CSRF_TOKEN = 'signin-magiclink-csrf-token'

// ── Settings bundle with a ready mail transport ─────────────────────────────

const MAGIC_LINK_TEST_BUNDLE = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  security: {
    ...TEST_BLOG_SETTINGS_BUNDLE.security,
    passkey: { enabled: true },
  },
  mail: {
    mail: {
      ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
      enabled: true,
      apiKey: 'test-key',
    },
  },
  rateLimit: {
    ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit,
    signInIp: { windowSeconds: 60, maxAttempts: 10 },
    otpSendIp: { windowSeconds: 60, maxAttempts: 3 },
    otpSendEmail: { windowSeconds: 60, maxAttempts: 10 },
  },
} as BlogSettingsBundle

// ── Import route under test ─────────────────────────────────────────────────

const { action, loader } = await import('@/routes/auth/signin')

// ── Test setup ──────────────────────────────────────────────────────────────

let testSession: BlogSession
let markSessionDirty: Mock<() => void>

beforeEach(async () => {
  // The real audit pipeline: recordAuditEvent pushes into the
  // process-level batcher; flush before teardown so no pending event
  // references a user row the next clearAllTables will wipe (FK).
  initAllBatchers(getDatabaseHandle())
  setBlogSettingsBundleForTests(MAGIC_LINK_TEST_BUNDLE)
  await clearAllTables(db)
  // The real install gate needs an installed deployment: seed one admin.
  await seedGateAdmin()
  __resetRateLimitsForTests()
  testSession = makeSession({})
  testSession.set('csrfToken', CSRF_TOKEN)
  markSessionDirty = vi.fn<() => void>()
  mockHandles.getRequestContext.mockReturnValue(
    makeRequestContext({
      session: testSession,
      db,
      request: new Request('http://localhost/admin/signin'),
      markSessionDirty,
    }),
  )
  mockHandles.sendSignInLink.mockClear()
  mockHandles.sendSignInLink.mockResolvedValue({ ok: true })
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'correcthorsebatterystaple'

/** Satisfies the real install gate (hasAdmin) without colliding with the
 * per-test `admin@example.com` seeds. */
async function seedGateAdmin() {
  await db.insert(user).values({
    name: 'Gatekeeper',
    email: 'gatekeeper@example.com',
    password: 'not-a-real-hash',
    role: 'admin',
  })
}

async function seedUser(loginMethod: 'password' | 'magic-link' | 'passkey', email = 'admin@example.com') {
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12)
  const [inserted] = await db
    .insert(user)
    .values({
      name: 'Admin',
      email,
      emailVerified: true,
      link: '',
      password: hashedPassword,
      role: 'admin',
      badgeName: 'MOD',
      badgeColor: '#007a82',
      receiveEmail: true,
      loginMethod,
    })
    .returning()
  return inserted
}

function setContext(action: string | null, redirectTo = '/admin', clientAddress = '127.0.0.1') {
  const params = new URLSearchParams()
  if (action) {
    params.set('action', action)
  }
  params.set('redirect_to', redirectTo)
  const url = new URL(`http://localhost/admin/signin?${params.toString()}`)
  mockHandles.getRequestContext.mockReturnValue(
    makeRequestContext({ session: testSession, clientAddress, db, request: new Request(url), markSessionDirty }),
  )
  return url
}

async function callAction(
  actionName: string | null,
  formData: FormData,
  redirectTo = '/admin',
  clientAddress = '127.0.0.1',
): Promise<Response & { data?: any }> {
  const url = setContext(actionName, redirectTo, clientAddress)
  const request = new Request('http://localhost/admin/signin', {
    method: 'POST',
    body: formData,
  })
  try {
    return (await action({
      request,
      url,
      context: new Map(),
      params: {},
      pattern: 'admin/signin',
    })) as Response
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
}

async function callLoader(search: string): Promise<Response & { data?: any }> {
  const url = new URL(`http://localhost/admin/signin${search}`)
  mockHandles.getRequestContext.mockReturnValue(
    makeRequestContext({ session: testSession, db, request: new Request(url), markSessionDirty }),
  )
  try {
    return (await loader({
      request: new Request(url),
      url,
      context: new Map(),
      params: {},
      pattern: 'admin/signin',
    })) as unknown as Response
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
}

function emailFormData(email = 'admin@example.com') {
  const fd = new FormData()
  fd.set('email', email)
  fd.set('csrf_token', CSRF_TOKEN)
  return fd
}

function magicLinkFormData(token: string) {
  const fd = new FormData()
  fd.set('magic_token', token)
  fd.set('csrf_token', CSRF_TOKEN)
  return fd
}

async function getLinkRow(userId: number) {
  const rows = await db
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'signin-link'), eq(verification.userId, userId)))
  return rows[0] ?? null
}

/** Audit rows of one action, flushed first so the batcher has drained. */
async function auditRowsFor(actionName: string) {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, actionName))
}

/** Run identify and pull the raw token out of the emailed link. */
async function identifyAndExtractToken(email = 'admin@example.com'): Promise<string> {
  await callAction('identify', emailFormData(email))
  expect(mockHandles.sendSignInLink).toHaveBeenCalledTimes(1)
  const link = mockHandles.sendSignInLink.mock.calls[0]![1] as string
  const token = new URL(link).searchParams.get('token')
  expect(token).toBeTruthy()
  return token as string
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('integration: magic-link signin flow (real DB)', () => {
  it('identify sends a link and stages a signin-link token for a magic-link user', async () => {
    const admin = await seedUser('magic-link')

    const result = await callAction('identify', emailFormData())
    expect(result.data?.message).toBe('如果该邮箱已注册，登录链接已发送，请查收邮箱。')

    expect(mockHandles.sendSignInLink).toHaveBeenCalledTimes(1)
    const [recipient, link] = mockHandles.sendSignInLink.mock.calls[0]! as [{ email: string }, string]
    expect(recipient.email).toBe('admin@example.com')
    expect(link).toContain('/admin/signin?action=magiclink')
    expect(link).toContain('token=')
    expect(link).toContain('redirect_to=%2Fadmin')

    const row = await getLinkRow(admin.id)
    expect(row).not.toBeNull()
    expect(row!.purpose).toBe('signin-link')

    // Sending stages nothing in the session.
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('identify answers unknown emails exactly like a magic-link send (no existence oracle)', async () => {
    const result = await callAction('identify', emailFormData('ghost@example.com'))
    // Same generic copy as a real send, but nothing is sent or persisted.
    expect(result.data?.message).toBe('如果该邮箱已注册，登录链接已发送，请查收邮箱。')
    expect(mockHandles.sendSignInLink).not.toHaveBeenCalled()
  })

  it('identify answers method=password for a regular user', async () => {
    await seedUser('password')
    const result = await callAction('identify', emailFormData())
    expect(result.data?.method).toBe('password')
    expect(mockHandles.sendSignInLink).not.toHaveBeenCalled()
  })

  it('identify answers method=passkey for a passkey-method user', async () => {
    await seedUser('passkey')
    const result = await callAction('identify', emailFormData())
    expect(result.data?.method).toBe('passkey')
    expect(mockHandles.sendSignInLink).not.toHaveBeenCalled()
  })

  it('full round-trip: identify → emailed link → confirm consumes token and establishes session', async () => {
    const admin = await seedUser('magic-link')
    const token = await identifyAndExtractToken()

    // The loader peeks the token without consuming it.
    const peeked = await callLoader(`?action=magiclink&token=${encodeURIComponent(token)}`)
    expect(peeked.data?.action).toBe('magiclink')
    expect(peeked.data?.magicToken).toBe(token)
    expect(await getLinkRow(admin.id)).not.toBeNull()

    const result = await callAction('magiclink', magicLinkFormData(token))

    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toBe('/admin')
    // The real establishLoginSession minted the cookie…
    expect(result.headers.get('Set-Cookie')).toMatch(/^__session=/)

    // …wrote the admin's session row…
    const sessions = await db.select().from(sessionTable).where(eq(sessionTable.userId, admin.id))
    expect(sessions).toHaveLength(1)

    // …and recorded the login audit with the magic-link method.
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.actorId).toBe(admin.id)
    expect(logins[0]!.details).toMatchObject({ method: 'magic-link' })

    // Single-use: the row is gone and a replay fails.
    expect(await getLinkRow(admin.id)).toBeNull()
    const replay = await callAction('magiclink', magicLinkFormData(token))
    expect(replay.data?.error).toBe('链接无效或已过期，请重新获取。')
  })

  it('expired token is rejected by both the loader peek and the consume', async () => {
    const admin = await seedUser('magic-link')
    const token = await identifyAndExtractToken()

    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(verification.purpose, 'signin-link'), eq(verification.userId, admin.id)))

    const peeked = await callLoader(`?action=magiclink&token=${encodeURIComponent(token)}`)
    expect(peeked.data?.tokenError).toBe('链接无效或已过期。')
    expect(peeked.data?.magicToken).toBeNull()

    const result = await callAction('magiclink', magicLinkFormData(token))
    expect(result.data?.error).toBe('链接无效或已过期，请重新获取。')
    // No session was established for the user.
    expect(await db.select().from(sessionTable).where(eq(sessionTable.userId, admin.id))).toHaveLength(0)
  })

  it('rate limiting blocks the 4th link send', async () => {
    await seedUser('magic-link')
    const uniqueIp = '127.0.0.77'

    for (let i = 0; i < 3; i++) {
      await callAction('identify', emailFormData(), '/admin', uniqueIp)
    }
    expect(mockHandles.sendSignInLink).toHaveBeenCalledTimes(3)

    const result = await callAction('identify', emailFormData(), '/admin', uniqueIp)
    expect(result.data?.error).toBe('发送过于频繁，请稍后再试。')
    expect(mockHandles.sendSignInLink).toHaveBeenCalledTimes(3)
  })

  it('records a magic_link_sent audit event', async () => {
    const admin = await seedUser('magic-link')
    await callAction('identify', emailFormData())

    const sent = await auditRowsFor('magic_link_sent')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.resourceType).toBe('user')
    expect(sent[0]!.resourceId).toBe(String(admin.id))
  })
})
