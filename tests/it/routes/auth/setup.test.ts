import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRouteContext } from '#/_helpers/context'
import { emptySession } from '#/_helpers/session'

vi.mock('@/server/domains/auth/context', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/context')>('@/server/domains/auth/context')
  return {
    ...actual,
    getRouteRequestContext: vi.fn(({ request }: { request: Request }) => ({
      session: emptySession(),
      user: undefined,
      role: null,
      clientAddress: '127.0.0.1',
      url: new URL(request.url),
    })),
  }
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

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  ensureInstalledOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => false),
  getInstallState: vi.fn(async () => 'noAdmin' as const),
}))

const installGate = await import('@/server/domains/settings/install-gate')
const flows = await import('@/server/domains/auth/flows')
const { action, loader } = await import('@/routes/auth/setup/index')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(installGate.ensureNoAdminOrRedirect).mockImplementation(async () => null)
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

describe('routes/setup', () => {
  describe('loader', () => {
    it('returns data payload when noAdmin', async () => {
      const result = await loader({
        request: new Request('http://localhost/admin/setup'),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data: Record<string, unknown> }).data
      expect(payload).toBeDefined()
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

  describe('action', () => {
    it('returns error when schema validation fails', async () => {
      const formData = new FormData()
      // missing required fields

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
      expect(data?.error).toBe('请填写完整的管理员账号信息。')
    })

    it('calls signUpInitialAdminWithSession with parsed data and context', async () => {
      const formData = new FormData()
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', '1234567890')

      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
        params: {},
        pattern: 'admin/setup',
      })

      expect(flows.signUpInitialAdminWithSession).toHaveBeenCalledOnce()
      const call = vi.mocked(flows.signUpInitialAdminWithSession).mock.calls[0]!
      expect(call[2]).toMatchObject({
        title: 'Blog',
        name: 'A',
        email: 'a@b.com',
        password: '1234567890',
        session: expect.anything(),
        request: expect.anything(),
        clientAddress: '127.0.0.1',
      })
    })
  })
})
