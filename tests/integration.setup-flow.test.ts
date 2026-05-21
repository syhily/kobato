import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { emptySession } from './_helpers/session'

// Stub Redis so `establishLoginSession` can commit the session.
vi.mock('@/server/infra/redis/storage', () => ({
  redisInstance: () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    sadd: vi.fn(async () => 1),
    srem: vi.fn(async () => 1),
    smembers: vi.fn(async () => []),
    hset: vi.fn(async () => 1),
    hgetall: vi.fn(async () => ({})),
    pexpireat: vi.fn(async () => 1),
    pipeline: () => ({
      del: () => {
        /* noop */
      },
      exec: vi.fn(async () => []),
    }),
  }),
}))

vi.mock('@/server/domains/auth/context', () => ({
  getRouteRequestContext: vi.fn().mockReturnValue({
    session: emptySession(),
    user: undefined,
    role: null,
    clientAddress: '127.0.0.1',
    url: new URL('http://localhost/admin/setup'),
  }),
}))

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  ensureInstalledOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => false),
  getInstallState: vi.fn(async () => 'noAdmin' as const),
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  hasAdmin: vi.fn(async () => false),
  insertAdmin: vi.fn(async () => [
    {
      id: 1n,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      name: 'Admin',
      email: 'admin@example.com',
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
    },
  ]),
  verifyUserPassword: vi.fn(),
  updateLastLogin: vi.fn(async () => undefined),
}))

vi.mock('@/server/infra/db/operations/setting', () => ({
  upsertSetting: vi.fn(async () => ({
    id: 1n,
    scope: 'blog.general',
    data: {},
    updatedAt: new Date(),
    updatedBy: 1n,
  })),
  findSettingByScope: vi.fn(async () => null),
}))

vi.mock('@/server/domains/settings/snapshot', () => ({
  refreshBlogSettings: vi.fn(async () => null),
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
}))

const userQuery = await import('@/server/infra/db/operations/user')
const settingQuery = await import('@/server/infra/db/operations/setting')
const settingsSnapshot = await import('@/server/domains/settings/snapshot')

const { action, loader } = await import('@/routes/auth/setup/index')

beforeEach(() => {
  vi.clearAllMocks()
})

// React Router's `redirect()` throws a Response object — catch it.
async function catchResponse(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
  throw new Error('Expected route to throw a Response')
}

describe('integration: /admin/setup full install flow', () => {
  it('loader issues a CSRF token and action accepts it, returning a redirect to /admin', async () => {
    const loaderResult = await loader({
      request: new Request('http://localhost/admin/setup'),
      url: new URL('http://localhost/admin/setup'),
      context: new Map(),
      params: {},
      pattern: 'admin/setup',
    })

    const payload = (loaderResult as { data: { csrf: string } }).data
    expect(payload.csrf).toBeDefined()
    expect(typeof payload.csrf).toBe('string')
    expect(payload.csrf.length).toBeGreaterThan(10)

    const init = (loaderResult as { init: { headers?: Record<string, string> } }).init
    const setCookie = init.headers?.['Set-Cookie'] ?? ''
    expect(setCookie).toContain('csrf-token=')

    const formData = new FormData()
    formData.set('title', 'My Blog')
    formData.set('name', 'Admin')
    formData.set('email', 'admin@example.com')
    formData.set('password', 'correcthorsebatterystaple')
    formData.set('csrf', payload.csrf)

    const response = await catchResponse(
      action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
          headers: { Cookie: setCookie.split(';')[0]! },
        }),
        url: new URL('http://localhost/admin/setup'),
        context: new Map(),
        params: {},
        pattern: 'admin/setup',
      }),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/admin')

    expect(userQuery.insertAdmin).toHaveBeenCalledOnce()
    expect(userQuery.insertAdmin).toHaveBeenCalledWith('Admin', 'admin@example.com', 'correcthorsebatterystaple')

    expect(settingQuery.upsertSetting).toHaveBeenCalled()
    const calls = vi.mocked(settingQuery.upsertSetting).mock.calls
    expect(calls.length).toBe(15)

    const scopes = new Set(calls.map(([, , scope]) => scope as string))
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
      expect(scopes.has(scope)).toBe(true)
    }

    expect(settingsSnapshot.refreshBlogSettings).toHaveBeenCalledOnce()

    const cookies = response.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('__session='))).toBe(true)
  })

  it('action rejects a mismatched CSRF token', async () => {
    const loaderResult = await loader({
      request: new Request('http://localhost/admin/setup'),
      url: new URL('http://localhost/admin/setup'),
      context: new Map(),
      params: {},
      pattern: 'admin/setup',
    })

    const init = (loaderResult as { init: { headers?: Record<string, string> } }).init
    const setCookie = init.headers?.['Set-Cookie'] ?? ''

    const formData = new FormData()
    formData.set('title', 'My Blog')
    formData.set('name', 'Admin')
    formData.set('email', 'admin@example.com')
    formData.set('password', 'correcthorsebatterystaple')
    formData.set('csrf', 'wrong-token')

    const actionResult = await action({
      request: new Request('http://localhost/admin/setup', {
        method: 'POST',
        body: formData,
        headers: { Cookie: setCookie.split(';')[0]! },
      }),
      url: new URL('http://localhost/admin/setup'),
      context: new Map(),
      params: {},
      pattern: 'admin/setup',
    })

    // CSRF failure returns a data object with an error field.
    const result = actionResult as { data: { error: string } }
    expect(result.data.error).toBeDefined()
    expect(userQuery.insertAdmin).not.toHaveBeenCalled()
    expect(settingQuery.upsertSetting).not.toHaveBeenCalled()
  })
})
