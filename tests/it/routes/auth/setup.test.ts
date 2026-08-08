import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRouteContext } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeSession } from '#/_helpers/session'
import { getSetupToken } from '@/server/domains/auth/setup-token'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { user } from '@/server/infra/db/schema/user'

vi.mock('@/server/http/request-context', async () => {
  const { createRequestContextMockModule } = await import('#/_helpers/auth-context-mock')
  return createRequestContextMockModule()
})

// Only mock: the install service — its real behavior is covered by
// setup-flow.test.ts against the same route.
vi.mock('@/server/domains/auth/services/setup', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/services/setup')>(
    '@/server/domains/auth/services/setup',
  )
  return {
    ...actual,
    signUpInitialAdminWithSession: vi.fn(),
  }
})

// Install gate, setup token and CSRF run real: gate from `user`
// (cleared = noAdmin), token in `one_time_token`, real CSRF check.
const CSRF_TOKEN = 'setup-route-csrf-token'

const db = getTestDb()

const mockContext = await import('@/server/http/request-context')
const flows = await import('@/server/domains/auth/services/setup')
const { __resetRateLimitsForTests, tryKeyedRateLimit } = await import('@/server/infra/rate-limit')
const { action, loader } = await import('@/routes/auth/setup/index')

beforeAll(() => {
  // Overlay the real db handle so the gate / token / CSRF code hits the integration db.
  const fromProvider = vi.mocked(mockContext.getRequestContext).getMockImplementation()
  vi.mocked(mockContext.getRequestContext).mockImplementation((args) => ({
    ...fromProvider!(args),
    db,
  }))
})

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
  __resetRateLimitsForTests()
  vi.mocked(flows.signUpInitialAdminWithSession).mockResolvedValue({ type: 'redirect', to: '/admin' })
})

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

/** A session carrying the CSRF token the real validateCsrfForAction checks. */
function csrfSession(extra: Record<string, unknown> = {}) {
  return makeSession({ csrfToken: CSRF_TOKEN, ...extra })
}

function withCsrf(formData: FormData): FormData {
  formData.set('csrf_token', CSRF_TOKEN)
  return formData
}

async function mintSetupToken(): Promise<string> {
  return getSetupToken(db)
}

async function seedAdminRow() {
  await db.insert(user).values({
    name: 'Admin',
    email: 'admin@example.com',
    password: 'not-a-real-hash',
    role: 'admin',
  })
}

describe('routes/setup', () => {
  describe('loader', () => {
    it('returns setupTokenVerified: false and no plaintext token when noAdmin', async () => {
      const result = await loader({
        request: new Request('http://localhost/admin/setup'),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data: Record<string, unknown> }).data
      expect(payload).toBeDefined()
      expect(payload.setupTokenVerified).toBe(false)
      expect(payload).not.toHaveProperty('setupToken')
    })

    it('returns setupTokenVerified: true when session flag is set', async () => {
      const result = await loader({
        request: new Request('http://localhost/admin/setup'),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: makeSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data: Record<string, unknown> }).data
      expect(payload).toBeDefined()
      expect(payload.setupTokenVerified).toBe(true)
    })

    it('redirects to /admin/signin when installed', async () => {
      // The real gate: an admin row flips the install state to installed.
      await seedAdminRow()

      const response = await catchResponse(
        loader({
          request: new Request('http://localhost/admin/setup'),
          url: new URL('http://localhost/admin/setup'),
          context: makeRouteContext(),
          params: {},
          pattern: 'admin/setup',
        }),
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe('/admin/signin')
    })
  })

  describe('action: verify-token', () => {
    it('returns setupTokenVerified: true for valid token', async () => {
      const token = await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', token)

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        // Anonymous session — the session table's user_id FK rejects the helper's fake user.
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.setupTokenVerified).toBe(true)
    })

    it('stores only the boolean flag in session, never the plaintext token', async () => {
      const token = await mintSetupToken()
      const session = csrfSession()

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', token)

      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session }),
        params: {},
        pattern: 'admin/setup',
      })

      expect(session.data.setupTokenVerified).toBe(true)
      expect(session.data).not.toHaveProperty('setupToken')
      expect(session.data).not.toHaveProperty('setup_token')
    })

    it('returns error for invalid token', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'invalid-token')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.error).toBe('Setup Token 错误，请查看服务器控制台输出。')
    })

    it('returns 429 when rate limited', async () => {
      // Ten seeded hits trip the setup-verify bucket (10/hour/IP) before the action's own hit.
      for (let i = 0; i < 10; i += 1) {
        await tryKeyedRateLimit('rate-limit:setup-verify:127.0.0.1', { windowSeconds: 3600, maxAttempts: 10 })
      }

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'valid-token')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data?: Record<string, unknown>; init?: { status?: number } }).data
      const status = (result as { init?: { status?: number } }).init?.status
      expect(payload?.error).toBe('请求过于频繁，请稍后再试。')
      expect(status).toBe(429)
    })
  })

  describe('action: install', () => {
    it('returns error when not verified', async () => {
      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请先验证 Setup Token。')
    })

    it('treats missing intent as install (backward compat)', async () => {
      const formData = new FormData()
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请先验证 Setup Token。')
    })

    it('returns error when setup token has expired', async () => {
      // A real but expired token row: isSetupTokenActive reads it as a miss.
      await db.insert(oneTimeToken).values({
        key: 'setup_token',
        payload: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
      })

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('Setup Token 已过期或失效，请重新验证。')
    })

    it('returns error when schema validation fails', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写完整的管理员账号信息。')
    })

    it('calls signUpInitialAdminWithSession with parsed data and context', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      expect(flows.signUpInitialAdminWithSession).toHaveBeenCalledOnce()
      const call = vi.mocked(flows.signUpInitialAdminWithSession).mock.calls[0]!
      expect(call[1]).toMatchObject({
        title: 'Blog',
        name: 'A',
        email: 'a@b.com',
        password: 'Password1234',
        session: expect.anything(),
        request: expect.anything(),
        clientAddress: '127.0.0.1',
      })
    })
  })
})
