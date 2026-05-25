import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  processAuthFormSubmission: vi.fn(),
}))

const state = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  return {
    loggedIn: false,
    session: {
      get(key: string) {
        return store.get(key)
      },
      set(key: string, value: unknown) {
        store.set(key, value)
      },
      unset(key: string) {
        store.delete(key)
      },
    },
  }
})

// `getRouteRequestContext` lives in `@/server/domains/auth/context` and is
// re-exported from `@/server/session`. The route module imports it
// from the original path, so the mock has to land there to be
// effective.
vi.mock('@/server/domains/auth/context', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/context')>('@/server/domains/auth/context')
  return {
    ...actual,
    getRouteRequestContext: vi.fn(({ request }: { request: Request }) => ({
      session: state.session,
      user: state.loggedIn ? { id: '1', name: 'admin', email: 'admin@example.com' } : undefined,
      role: state.loggedIn ? ('admin' as const) : null,
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

vi.mock('@/server/domains/auth/session-storage', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/session-storage')>(
    '@/server/domains/auth/session-storage',
  )
  return {
    ...actual,
    commitSession: vi.fn(async () => 'blog_session=stub'),
    destroySession: vi.fn(async () => 'blog_session=deleted'),
  }
})

// BEFORE doing anything else. Stub the helper to a no-op so we
// exercise the `redirect_to` sanitisation logic these tests target
// without spinning up a Postgres connection.
vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureInstalledOrRedirect: vi.fn(async () => null),
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => true),
  getInstallState: vi.fn(async () => 'installed' as const),
}))

const { action, loader } = await import('@/routes/auth/signin')

beforeEach(() => {
  vi.clearAllMocks()
  state.loggedIn = false
  mocks.processAuthFormSubmission.mockResolvedValue({ ok: true })
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

describe('routes/signin', () => {
  it('sanitizes external logout redirect targets', async () => {
    const response = await catchResponse(
      loader({
        request: new Request('http://localhost/admin/signin?action=logout&redirect_to=https://evil.example/phish'),
      } as unknown as Parameters<typeof loader>[0]),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

  it('sanitizes external already-logged-in redirect targets', async () => {
    state.loggedIn = true
    const response = await catchResponse(
      loader({
        request: new Request('http://localhost/admin/signin?redirect_to=//evil.example/phish'),
      } as unknown as Parameters<typeof loader>[0]),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

  it('passes only a sanitized redirect target into login form handling', async () => {
    await action({
      request: new Request('http://localhost/admin/signin?redirect_to=https://evil.example/phish', {
        method: 'POST',
        body: new FormData(),
      }),
    } as unknown as Parameters<typeof action>[0])

    expect(mocks.processAuthFormSubmission).toHaveBeenCalledWith(expect.objectContaining({ redirectTo: '/admin' }))
  })
})
