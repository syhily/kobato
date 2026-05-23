import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRouteContext } from './_helpers/context'
import { emptySession } from './_helpers/session'

const mocks = vi.hoisted(() => ({
  processAuthFormSubmission: vi.fn(),
}))

// `getRouteRequestContext` lives in `@/server/domains/auth/context` and is
// re-exported from `@/server/session`. The route module imports it
// from the original path, so the mock has to land there to be
// effective.
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
    processAuthFormSubmission: mocks.processAuthFormSubmission,
  }
})

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  ensureInstalledOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => false),
  getInstallState: vi.fn(async () => 'noAdmin' as const),
}))

const installGate = await import('@/server/domains/settings/install-gate')
const { action, loader } = await import('@/routes/auth/setup/index')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(installGate.ensureNoAdminOrRedirect).mockImplementation(async () => null)
  mocks.processAuthFormSubmission.mockResolvedValue({ error: null })
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
    it('calls processAuthFormSubmission with correct schema and fields', async () => {
      const formData = new FormData()
      formData.set('title', 'My Blog')
      formData.set('name', 'Admin')
      formData.set('email', 'admin@example.com')
      formData.set('password', 'correcthorsebatterystaple')

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

      expect(mocks.processAuthFormSubmission).toHaveBeenCalledOnce()
      const call = mocks.processAuthFormSubmission.mock.calls[0]![0]
      expect(call.schema).toBeDefined()
      expect(call.fields).toEqual(['title', 'name', 'email', 'password'])
      expect(call.defaultErrorMessage).toBe('请填写完整的管理员账号信息。')
      expect(call.redirectTo).toBeUndefined()
    })

    it('passes session, request and clientAddress to signUpInitialAdminWithSession', async () => {
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

      const call = mocks.processAuthFormSubmission.mock.calls[0]![0]
      expect(call.run).toBeDefined()
      // `run` is a closure that spreads the parsed input with session/request/clientAddress
      expect(typeof call.run).toBe('function')
    })
  })
})
