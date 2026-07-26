import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'

const hydrateMock = vi.hoisted(() => vi.fn())
const routerContextSetMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/bootstrap/db-lifecycle', () => ({
  getDb: () => ({ id: 'db-mock' }),
  getPool: () => ({ id: 'pool-mock' }),
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: hydrateMock,
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

// The perimeter middleware derives the canonical RequestContext
// (`@/server/http/request-context`) once per request; `buildLoadContext`
// only projects it. These tests hand it a stub carrying the fields the
// projection reads (`session` / `viewer` / `clientAddress` / `url`) plus
// the pass-through handles (`db` / `pool` / `cspNonce`).
function makeContextStub(overrides: Record<string, unknown> = {}) {
  return {
    var: {
      requestContext: {
        session: { get: () => undefined },
        viewer: null,
        clientAddress: '127.0.0.1',
        url: new URL('http://localhost/'),
        db: { id: 'db-stub' },
        pool: { id: 'pool-stub' },
        cspNonce: 'test-nonce-123',
        markSessionDirty: () => {},
        ...overrides,
      },
    },
    req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
  } as any
}

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

    const c = makeContextStub()

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

    await expect(buildLoadContext(makeContextStub())).rejects.toThrow('DB pool exhausted')
  })

  it('threads the CSP nonce into the React Router context', async () => {
    hydrateMock.mockResolvedValue(undefined)
    BLOG_SETTINGS_SNAPSHOT_SLOT.write({ siteIdentity: { title: 'Test' } } as any)

    await buildLoadContext(makeContextStub())

    // One of the context.set calls must carry the nonce value.
    const values = routerContextSetMock.mock.calls.map((call) => call[1])
    expect(values).toContain('test-nonce-123')
  })
})
