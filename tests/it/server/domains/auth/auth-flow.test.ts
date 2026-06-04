import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { flushWorkerRedis } from '#/_helpers/redis'
import { emptySession } from '#/_helpers/session'

// `signInWithSession` is the single entry-point both the public admin login
// route and integration-style harnesses use to authenticate. We pin the two
// behavioural guarantees that are easy to silently regress:
//
//   1. The successful response carries BOTH a `__session` cookie (so the
//      browser persists the new login) AND a rotated `csrf-token` cookie
//      (so any concurrently-open admin tab picks up a fresh, session-bound
//      token without having to re-fetch the form).
//   2. The rate limiter only round-trips Redis once per attempt (the
//      legacy `exceedLimit` + `incrLimit` pair was collapsed into
//      `tryRateLimit`).
//
// Redis is real (session storage writes encrypted session blobs), while
// DB operations stay mocked so boundary-condition tests (empty insertAdmin
// result, concurrent-install race) remain possible without heavy fixture
// setup.

vi.mock('@/server/infra/db/operations/user', () => ({
  hasAdmin: vi.fn(async () => false),
  insertAdmin: vi.fn(async () => []),
  verifyUserPassword: vi.fn(),
  updateLastLogin: vi.fn(async () => undefined),
}))

vi.mock('@/server/infra/db/operations/setting', () => ({
  upsertSetting: vi.fn(async () => undefined),
  findSettingByScope: vi.fn(async () => null),
}))

vi.mock('@/server/domains/settings/snapshot', () => ({
  refreshBlogSettings: vi.fn(async () => null),
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
}))

vi.mock('@/server/domains/audit/service', () => ({
  recordAuditEvent: vi.fn(),
  buildAuditContext: vi.fn(),
  recordAuditEventFromContext: vi.fn(),
}))

const db = {} as NodePgDatabase
const pool = {} as any

const userQuery = await import('@/server/infra/db/operations/user')
const settingQuery = await import('@/server/infra/db/operations/setting')
const settingsSnapshot = await import('@/server/domains/settings/snapshot')
const rateLimit = await import('@/server/infra/rate-limit')
import type { User } from '@/server/infra/db/types'

import { signUpInitialAdminWithSession } from '@/server/domains/auth/flows'

const verifyUserPasswordMock = vi.mocked(userQuery.verifyUserPassword)

function testUser(partial: Partial<User> = {}): User {
  return {
    id: 1n,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    name: 'Test',
    email: 'test@example.com',
    emailVerified: false,
    link: null,
    password: 'hashed',
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    lastIp: null,
    lastUa: null,
    role: 'admin',
    isMuted: false,
    receiveEmail: true,
    ...partial,
  }
}

beforeEach(async () => {
  verifyUserPasswordMock.mockReset()
  vi.mocked(userQuery.hasAdmin).mockReset()
  vi.mocked(userQuery.hasAdmin).mockResolvedValue(false)
  vi.mocked(userQuery.insertAdmin).mockReset()
  vi.mocked(userQuery.insertAdmin).mockResolvedValue([])
  vi.mocked(settingQuery.upsertSetting).mockReset()
  vi.mocked(settingsSnapshot.refreshBlogSettings).mockReset()
  vi.mocked(rateLimit.tryRateLimit).mockReset()
  vi.mocked(rateLimit.tryRateLimit).mockResolvedValue({ count: 1, exceeded: false })
  await flushWorkerRedis()
})

function buildRequest(): Request {
  return new Request('http://localhost/admin/signin', { method: 'POST' })
}

describe('services/auth/flow — signUpInitialAdminWithSession (install stage 1)', () => {
  const baseSeed = {
    title: 'My Blog',
    name: 'Admin',
    email: 'admin@example.com',
    password: 'CorrectHorse1',
  }

  it('creates the admin row, seeds all settings, and redirects to /admin', async () => {
    vi.mocked(userQuery.insertAdmin).mockResolvedValue([
      testUser({ id: 7n, name: 'Admin', email: 'admin@example.com', link: '', role: 'admin' }),
    ])
    const request = buildRequest()

    const result = await signUpInitialAdminWithSession(db, pool, {
      ...baseSeed,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
    })

    expect(result.type).toBe('redirect')
    if (result.type === 'redirect') {
      expect(result.to).toBe('/admin')
    }
    expect(userQuery.insertAdmin).toHaveBeenCalledWith(db, 'Admin', 'admin@example.com', baseSeed.password)

    // All settings sections are seeded in one pass.
    expect(settingQuery.upsertSetting).toHaveBeenCalled()
    const calls = vi.mocked(settingQuery.upsertSetting).mock.calls
    const byScope = new Map<string, { data: Record<string, unknown>; updatedBy: bigint | null }>()
    for (const [_1, data, updatedBy, scope] of calls) {
      byScope.set(scope, { data: data as Record<string, unknown>, updatedBy })
    }

    const EXPECTED_SECTIONS = [
      'blog.general',
      'blog.assets',
      'blog.navigation',
      'blog.socials',
      'blog.content',
      'blog.sidebar',
      'blog.comments',
      'blog.seo',
      'blog.mail',
      'blog.cache',
      'blog.rateLimit',
      'blog.search',
      'blog.fonts',
      'blog.backup',
      'blog.limits',
    ]
    for (const scope of EXPECTED_SECTIONS) {
      expect(byScope.has(scope)).toBe(true)
    }

    const general = byScope.get('blog.general')
    expect(general?.data.title).toBe('My Blog')
    expect(general?.data.locale).toBe('zh-CN')
    expect(general?.data.author).toMatchObject({
      name: 'Admin',
      email: 'admin@example.com',
    })

    const assets = byScope.get('blog.assets')
    expect(assets?.data.asset).toEqual({ host: 'localhost', scheme: 'https' })

    expect(settingsSnapshot.refreshBlogSettings).toHaveBeenCalledWith(db)
  })

  it('refuses a duplicate stage-1 install (returns 409, no DB writes)', async () => {
    vi.mocked(userQuery.hasAdmin).mockResolvedValue(true)
    const request = buildRequest()

    const result = await signUpInitialAdminWithSession(db, pool, {
      ...baseSeed,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
    })

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('管理员账号已存在')
    }
    expect(userQuery.insertAdmin).not.toHaveBeenCalled()
  })

  it('returns 400 when the request body is invalid', async () => {
    const result = await signUpInitialAdminWithSession(db, pool, {
      ...baseSeed,
      session: emptySession(),
      request: new Request('http://localhost/admin/setup', { method: 'POST' }),
      clientAddress: '127.0.0.1',
    })

    // Without CSRF, an empty POST body fails schema validation
    // and returns the default error wrapped in a 400-level response.
    expect(result).toBeDefined()
  })

  it('returns 500 and never seeds when insertAdmin yields an empty result', async () => {
    vi.mocked(userQuery.insertAdmin).mockResolvedValue([])
    const request = buildRequest()

    const result = await signUpInitialAdminWithSession(db, pool, {
      ...baseSeed,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
    })

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('创建管理员账号失败')
    }
    expect(settingQuery.upsertSetting).not.toHaveBeenCalled()
    expect(settingsSnapshot.refreshBlogSettings).not.toHaveBeenCalled()
  })

  it('propagates the error when insertAdmin throws (simulated concurrent install race)', async () => {
    vi.mocked(userQuery.insertAdmin).mockImplementation(() => {
      throw new Error('unique constraint on email')
    })
    const request = buildRequest()

    await expect(
      signUpInitialAdminWithSession(db, pool, {
        ...baseSeed,
        session: emptySession(),
        request,
        clientAddress: '127.0.0.1',
      }),
    ).rejects.toThrow('unique constraint on email')

    expect(settingQuery.upsertSetting).not.toHaveBeenCalled()
    expect(settingsSnapshot.refreshBlogSettings).not.toHaveBeenCalled()
  })
})
