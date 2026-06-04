import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRouteContext } from '#/_helpers/context'
import { emptySession, makeSession } from '#/_helpers/session'

vi.mock('@/server/domains/auth/context', async () => {
  const { createAuthContextMockModule } = await import('#/_helpers/auth-context-mock')
  return createAuthContextMockModule()
})

vi.mock('@/server/domains/auth/flows', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/flows')>('@/server/domains/auth/flows')
  return {
    ...actual,
    signUpInitialAdminWithSession: vi.fn(),
  }
})

vi.mock('@/server/domains/auth/csrf', () => ({
  validateCsrfForAction: vi.fn(() => true),
}))

vi.mock('@/server/infra/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/rate-limit')>()
  return {
    ...actual,
    tryKeyedRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  }
})

vi.mock('@/server/domains/auth/setup-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/auth/setup-token')>()
  return {
    ...actual,
    verifySetupToken: vi.fn(),
    isSetupTokenActive: vi.fn(async () => true),
  }
})

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  ensureInstalledOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => false),
  getInstallState: vi.fn(async () => 'noAdmin' as const),
}))

const installGate = await import('@/server/domains/settings/install-gate')
const flows = await import('@/server/domains/auth/flows')
const setupToken = await import('@/server/domains/auth/setup-token')
const rateLimit = await import('@/server/infra/rate-limit')
const { action, loader } = await import('@/routes/auth/setup/index')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(installGate.ensureNoAdminOrRedirect).mockImplementation(async () => null)
  vi.mocked(flows.signUpInitialAdminWithSession).mockResolvedValue({ type: 'redirect', to: '/admin' })
  vi.mocked(setupToken.isSetupTokenActive).mockResolvedValue(true)
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
      const { ensureNoAdminOrRedirect } = await import('@/server/domains/settings/install-gate')
      vi.mocked(ensureNoAdminOrRedirect).mockImplementation(async () => {
        throw new Response(null, { status: 303, headers: { Location: '/admin/signin' } })
      })

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
      vi.mocked(setupToken.verifySetupToken).mockResolvedValue(true)

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'valid-token')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.setupTokenVerified).toBe(true)
    })

    it('stores only the boolean flag in session, never the plaintext token', async () => {
      vi.mocked(setupToken.verifySetupToken).mockResolvedValue(true)
      const session = emptySession()

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'valid-token')

      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
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
      vi.mocked(setupToken.verifySetupToken).mockResolvedValue(false)

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'invalid-token')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.error).toBe('Setup Token 错误，请查看服务器控制台输出。')
    })

    it('returns 429 when rate limited', async () => {
      vi.mocked(rateLimit.tryKeyedRateLimit).mockResolvedValue({ count: 11, exceeded: true })

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'valid-token')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
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
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
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
      // no intent field

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请先验证 Setup Token。')
    })

    it('returns error when setup token has expired in Redis', async () => {
      vi.mocked(setupToken.isSetupTokenActive).mockResolvedValue(false)

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: makeSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('Setup Token 已过期或失效，请重新验证。')
    })

    it('returns error when schema validation fails', async () => {
      const formData = new FormData()
      formData.set('intent', 'install')
      // missing required fields

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: makeSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写完整的管理员账号信息。')
    })

    it('calls signUpInitialAdminWithSession with parsed data and context', async () => {
      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: makeSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      expect(flows.signUpInitialAdminWithSession).toHaveBeenCalledOnce()
      const call = vi.mocked(flows.signUpInitialAdminWithSession).mock.calls[0]!
      expect(call[2]).toMatchObject({
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
