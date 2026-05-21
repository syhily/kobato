import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { emptySession } from './_helpers/session'

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

// Stub Redis: the cookie-backed `createSessionStorage` writes the encrypted
// session id to Redis on commit and reads it back for `getSession`. The
// flow test only cares about the Set-Cookie surface, so a no-op Redis is
// enough; we do *not* mock `commitSession` itself, because the merged
// `signInWithSession` (in the same module) would still see the real export
// — `vi.mock` only swaps the module's *named* exports, not internal calls.
vi.mock('@/server/infra/redis/storage', () => ({
  redisInstance: () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    sadd: vi.fn(async () => 1),
    srem: vi.fn(async () => 1),
    smembers: vi.fn(async () => []),
    // Session metadata writes added in the session-management feature.
    // Stubs return success so `establishLoginSession` proceeds without
    // touching a real Redis.
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

const userQuery = await import('@/server/infra/db/operations/user')
const settingQuery = await import('@/server/infra/db/operations/setting')
const settingsSnapshot = await import('@/server/domains/settings/snapshot')
const rateLimit = await import('@/server/infra/rate-limit')
import type { User } from '@/server/infra/db/types'

import { issueCsrfToken } from '@/server/domains/auth/csrf'
import { signInWithSession, signUpInitialAdminWithSession } from '@/server/domains/auth/flows'

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

beforeEach(() => {
  verifyUserPasswordMock.mockReset()
  vi.mocked(userQuery.hasAdmin).mockReset()
  vi.mocked(userQuery.hasAdmin).mockResolvedValue(false)
  vi.mocked(userQuery.insertAdmin).mockReset()
  vi.mocked(userQuery.insertAdmin).mockResolvedValue([])
  vi.mocked(settingQuery.upsertSetting).mockReset()
  vi.mocked(settingsSnapshot.refreshBlogSettings).mockReset()
  vi.mocked(rateLimit.tryRateLimit).mockReset()
  vi.mocked(rateLimit.tryRateLimit).mockResolvedValue({ count: 1, exceeded: false })
})

function setCookieHeaders(headers: HeadersInit): string[] {
  if (headers instanceof Headers) {
    return headers.getSetCookie()
  }
  // Plain-object header path is used only on the empty-CSRF code branch;
  // surface it as a single-element array for symmetric test assertions.
  const value = (headers as Record<string, string>)['Set-Cookie']
  return value ? [value] : []
}

async function buildSignedRequest(token: string): Promise<{ request: Request; token: string }> {
  const issued = token === '' ? await issueCsrfToken() : { token, setCookie: '' }
  const cookie = issued.setCookie === '' ? '' : issued.setCookie.split(';')[0]!
  const request = new Request('http://localhost/admin/signin', {
    method: 'POST',
    headers: cookie ? { Cookie: cookie } : {},
  })
  return { request, token: issued.token }
}

// `login()` reads the password through `verifyUserPassword`. Returning a
// non-null record makes `login()` resolve `true`, returning `null` makes it
// resolve `false` — without us having to spy on `login` itself.
const stubUser = testUser({
  id: 1n,
  name: 'Admin',
  email: 'admin@yufan.me',
  link: null,
  role: 'admin',
})

describe('services/auth/flow — signInWithSession', () => {
  it('on success emits both a session cookie and a freshly-rotated CSRF cookie', async () => {
    verifyUserPasswordMock.mockResolvedValue(stubUser)
    const { request, token } = await buildSignedRequest('')

    const result = await signInWithSession({
      email: 'admin@yufan.me',
      password: 'correct horse',
      csrf: token,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
      redirectTo: '/admin',
    })

    expect(result.ok).toBe(true)
    const cookies = setCookieHeaders(result.headers)
    // Two distinct cookies must travel back: the session one and the
    // rotated CSRF one. `getSetCookie()` preserves them as separate values
    // (a plain-object header would silently overwrite), which is exactly
    // why the success path constructs a `Headers` instance.
    expect(cookies.some((c) => c.startsWith('__session='))).toBe(true)
    expect(cookies.some((c) => c.startsWith('csrf-token='))).toBe(true)
    // The new CSRF cookie carries a non-empty value (a `clearCsrfCookie`
    // regression would emit `csrf-token=; Max-Age=0`).
    const csrf = cookies.find((c) => c.startsWith('csrf-token='))!
    const value = csrf.split(';')[0].split('=')[1]
    expect(value.length).toBeGreaterThan(10)
    expect(csrf).toMatch(/HttpOnly/i)
    expect(csrf).toMatch(/SameSite=Lax/i)
  })

  it('only round-trips Redis once per attempt (no separate exceedLimit GET)', async () => {
    verifyUserPasswordMock.mockResolvedValue(stubUser)
    const { request, token } = await buildSignedRequest('')

    await signInWithSession({
      email: 'admin@yufan.me',
      password: 'correct horse',
      csrf: token,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
      redirectTo: '/admin',
    })

    expect(rateLimit.tryRateLimit).toHaveBeenCalledTimes(1)
    expect(rateLimit.tryRateLimit).toHaveBeenCalledWith('127.0.0.1')
  })

  it('returns 429 (and never invokes login) when the rate limiter trips', async () => {
    vi.mocked(rateLimit.tryRateLimit).mockResolvedValue({ count: 99, exceeded: true })
    const { request, token } = await buildSignedRequest('')

    const result = await signInWithSession({
      email: 'admin@yufan.me',
      password: 'correct horse',
      csrf: token,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
      redirectTo: '/admin',
    })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.status).toBe(429)
    }
    expect(verifyUserPasswordMock).not.toHaveBeenCalled()
  })

  it('returns 403 with no rotated CSRF cookie on bad credentials', async () => {
    verifyUserPasswordMock.mockResolvedValue(null)
    const { request, token } = await buildSignedRequest('')

    const result = await signInWithSession({
      email: 'admin@yufan.me',
      password: 'wrong',
      csrf: token,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
      redirectTo: '/admin',
    })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.status).toBe(403)
    }
    const cookies = setCookieHeaders(result.headers)
    expect(cookies.some((c) => c.startsWith('csrf-token='))).toBe(false)
  })
})

describe('services/auth/flow — signUpInitialAdminWithSession (install stage 1)', () => {
  const baseSeed = {
    title: 'My Blog',
    name: 'Admin',
    email: 'admin@yufan.me',
    password: 'correct horse staple battery',
  }

  it('creates the admin row, seeds all settings, and redirects to /admin', async () => {
    vi.mocked(userQuery.insertAdmin).mockResolvedValue([
      testUser({ id: 7n, name: 'Admin', email: 'admin@yufan.me', link: '', role: 'admin' }),
    ])
    const { request, token } = await buildSignedRequest('')

    const result = await signUpInitialAdminWithSession({
      ...baseSeed,
      csrf: token,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
    })

    expect(result.ok).toBe(true)
    if (result.ok === true) {
      expect(result.data.redirectTo).toBe('/admin')
    }
    expect(userQuery.insertAdmin).toHaveBeenCalledWith('Admin', 'admin@yufan.me', baseSeed.password)

    // All settings sections are seeded in one pass.
    expect(settingQuery.upsertSetting).toHaveBeenCalled()
    const calls = vi.mocked(settingQuery.upsertSetting).mock.calls
    const byScope = new Map<string, { data: Record<string, unknown>; updatedBy: bigint | null }>()
    for (const [data, updatedBy, scope] of calls) {
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
      email: 'admin@yufan.me',
    })

    const assets = byScope.get('blog.assets')
    expect(assets?.data.asset).toEqual({ host: 'localhost', scheme: 'https' })

    expect(settingsSnapshot.refreshBlogSettings).toHaveBeenCalledOnce()
  })

  it('refuses a duplicate stage-1 install (returns 409, no DB writes)', async () => {
    vi.mocked(userQuery.hasAdmin).mockResolvedValue(true)
    const { request, token } = await buildSignedRequest('')

    const result = await signUpInitialAdminWithSession({
      ...baseSeed,
      csrf: token,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
    })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.status).toBe(409)
    }
    expect(userQuery.insertAdmin).not.toHaveBeenCalled()
  })

  it('returns 403 when the CSRF token is present but the cookie is missing', async () => {
    const { token } = await buildSignedRequest('')
    const result = await signUpInitialAdminWithSession({
      ...baseSeed,
      csrf: token,
      session: emptySession(),
      request: new Request('http://localhost/admin/setup', { method: 'POST' }),
      clientAddress: '127.0.0.1',
    })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.status).toBe(403)
    }
    expect(userQuery.insertAdmin).not.toHaveBeenCalled()
  })

  it('returns 500 and never seeds when insertAdmin yields an empty result', async () => {
    vi.mocked(userQuery.insertAdmin).mockResolvedValue([])
    const { request, token } = await buildSignedRequest('')

    const result = await signUpInitialAdminWithSession({
      ...baseSeed,
      csrf: token,
      session: emptySession(),
      request,
      clientAddress: '127.0.0.1',
    })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.status).toBe(500)
    }
    expect(settingQuery.upsertSetting).not.toHaveBeenCalled()
    expect(settingsSnapshot.refreshBlogSettings).not.toHaveBeenCalled()
  })

  it('propagates the error when insertAdmin throws (simulated concurrent install race)', async () => {
    vi.mocked(userQuery.insertAdmin).mockImplementation(() => {
      throw new Error('unique constraint on email')
    })
    const { request, token } = await buildSignedRequest('')

    await expect(
      signUpInitialAdminWithSession({
        ...baseSeed,
        csrf: token,
        session: emptySession(),
        request,
        clientAddress: '127.0.0.1',
      }),
    ).rejects.toThrow('unique constraint on email')

    expect(settingQuery.upsertSetting).not.toHaveBeenCalled()
    expect(settingsSnapshot.refreshBlogSettings).not.toHaveBeenCalled()
  })
})
