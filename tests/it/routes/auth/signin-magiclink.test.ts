import type { Mock } from 'vitest'

import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { makeSession } from '#/_helpers/session'
import { user, verification } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// ── Mock handles ────────────────────────────────────────────────────────────

const mockHandles = vi.hoisted(() => ({
  getRequestContext: vi.fn<any>(),
  sendSignInLink: vi.fn<any>(),
  establishLoginSession: vi.fn<any>(),
  recordAuditEvent: vi.fn<any>(),
}))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/server/http/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/http/request-context')>()
  return {
    ...actual,
    getRequestContext: mockHandles.getRequestContext,
  }
})

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureInstalledOrRedirect: vi.fn(async () => null),
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => true),
  getInstallState: vi.fn(async () => 'installed' as const),
}))

vi.mock('@/server/domains/auth/csrf', () => ({
  validateCsrfForAction: vi.fn(() => true),
}))

vi.mock('@/server/infra/email/sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/email/sender')>()
  return {
    ...actual,
    sendSignInLink: mockHandles.sendSignInLink,
  }
})

vi.mock('@/server/domains/auth/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/auth/primitives')>()
  return {
    ...actual,
    establishLoginSession: mockHandles.establishLoginSession,
  }
})

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEvent: mockHandles.recordAuditEvent,
}))

// ── Real infrastructure ─────────────────────────────────────────────────────

const db = getTestDb()

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

beforeAll(() => {
  mockHandles.sendSignInLink.mockResolvedValue({ ok: true })
  mockHandles.establishLoginSession.mockResolvedValue({
    sid: 'test-sid',
    setCookie: '__session=test-cookie; Path=/',
  })
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(MAGIC_LINK_TEST_BUNDLE)
  await clearAllTables(db)
  __resetRateLimitsForTests()
  testSession = makeSession({})
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
  mockHandles.establishLoginSession.mockClear()
  mockHandles.recordAuditEvent.mockClear()
  mockHandles.sendSignInLink.mockResolvedValue({ ok: true })
  mockHandles.establishLoginSession.mockResolvedValue({
    sid: 'test-sid',
    setCookie: '__session=test-cookie; Path=/',
  })
})

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'correcthorsebatterystaple'

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
  return fd
}

async function getLinkRow(userId: number) {
  const rows = await db
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'signin-link'), eq(verification.userId, userId)))
  return rows[0] ?? null
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

  it('identify answers method=password for unknown emails without sending', async () => {
    const result = await callAction('identify', emailFormData('ghost@example.com'))
    expect(result.data?.method).toBe('password')
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

    const fd = new FormData()
    fd.set('magic_token', token)
    const result = await callAction('magiclink', fd)

    expect(mockHandles.establishLoginSession).toHaveBeenCalledWith(
      db,
      testSession,
      expect.objectContaining({ id: admin.id, role: 'admin' }),
      expect.any(Request),
      '127.0.0.1',
      { authMethod: 'magic-link' },
    )
    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toBe('/admin')
    expect(result.headers.get('Set-Cookie')).toBe('__session=test-cookie; Path=/')

    // Single-use: the row is gone and a replay fails.
    expect(await getLinkRow(admin.id)).toBeNull()
    const replay = await callAction('magiclink', fd)
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

    const fd = new FormData()
    fd.set('magic_token', token)
    const result = await callAction('magiclink', fd)
    expect(result.data?.error).toBe('链接无效或已过期，请重新获取。')
    expect(mockHandles.establishLoginSession).not.toHaveBeenCalled()
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

    const sentCall = mockHandles.recordAuditEvent.mock.calls.find(
      (call: any[]) => call[0]?.action === 'magic_link_sent',
    ) as unknown as [Record<string, unknown>] | undefined
    expect(sentCall).toBeDefined()
    expect(sentCall![0].resourceId).toBe(String(admin.id))
  })
})
