import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'

const hydrateMock = vi.hoisted(() => vi.fn())
const routeContextsMock = vi.hoisted(() =>
  vi.fn(() => ({
    session: { session: {}, user: null, role: null },
    request: { clientAddress: '127.0.0.1', url: new URL('http://localhost/') },
  })),
)
const routerContextSetMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/bootstrap/db-lifecycle', () => ({
  getDb: () => ({ id: 'db-mock' }),
  getPool: () => ({ id: 'pool-mock' }),
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: hydrateMock,
}))

vi.mock('@/server/http/middlewares/session', () => ({
  buildRouteContexts: routeContextsMock,
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    RouterContextProvider: vi.fn(function () {
      return { set: routerContextSetMock }
    }),
  }
})

const { buildLoadContext } = await import('@/server/http/middleware-pipeline')

describe('middleware-pipeline / buildLoadContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
    BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  })

  it('awaits hydrateBlogSettings before returning the context', async () => {
    let hydrationResolved = false

    hydrateMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      hydrationResolved = true
      BLOG_SETTINGS_SNAPSHOT_SLOT.write({ siteIdentity: { title: 'Test' } } as any)
    })

    const c = {
      var: { session: { get: () => undefined }, clientAddress: '127.0.0.1' },
      req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
    } as any

    const promise = buildLoadContext(c)

    // The promise must NOT resolve while hydration is still in flight.
    const immediate = await Promise.race([promise.then(() => 'resolved'), Promise.resolve('pending')])
    expect(immediate).toBe('pending')
    expect(hydrationResolved).toBe(false)

    // After awaiting, hydration must have finished.
    const context = await promise
    expect(hydrationResolved).toBe(true)
    expect(context).toBeDefined()
  })

  it('does not swallow a hydration failure — it propagates so the request becomes a 500', async () => {
    hydrateMock.mockRejectedValue(new Error('DB pool exhausted'))

    const c = {
      var: { session: { get: () => undefined }, clientAddress: '127.0.0.1' },
      req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
    } as any

    await expect(buildLoadContext(c)).rejects.toThrow('DB pool exhausted')
  })

  it('threads the CSP nonce into the React Router context', async () => {
    hydrateMock.mockResolvedValue(undefined)
    BLOG_SETTINGS_SNAPSHOT_SLOT.write({ siteIdentity: { title: 'Test' } } as any)

    const c = {
      var: { session: { get: () => undefined }, clientAddress: '127.0.0.1', cspNonce: 'test-nonce-123' },
      req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
    } as any

    await buildLoadContext(c)

    // One of the context.set calls must carry the nonce value.
    const values = routerContextSetMock.mock.calls.map((call) => call[1])
    expect(values).toContain('test-nonce-123')
  })
})
