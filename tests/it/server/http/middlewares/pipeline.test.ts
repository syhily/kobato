import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { makeRequestContext } from '#/_helpers/request-context'
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
// sets it on the RouterContextProvider as-is. These tests hand it a stub
// carrying the canonical fields (`session` / `viewer` / `clientAddress` /
// `url`) plus the pass-through handles (`db` / `pool` / `cspNonce`).
function makeContextStub(overrides: Record<string, unknown> = {}) {
  return {
    var: {
      requestContext: {
        ...makeRequestContext({
          session: { get: () => undefined } as unknown as BlogSession,
          clientAddress: '127.0.0.1',
          db: { id: 'db-stub' } as never,
          pool: { id: 'pool-stub' } as never,
          cspNonce: 'test-nonce-123',
        }),
        ...overrides,
      },
    },
    req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
  } as any
}

describe('middleware-pipeline / buildLoadContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetBlogSettingsForTests()
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

  it('sets the canonical RequestContext as the single React Router context value', async () => {
    hydrateMock.mockResolvedValue(undefined)
    BLOG_SETTINGS_SNAPSHOT_SLOT.write({ siteIdentity: { title: 'Test' } } as any)

    const c = makeContextStub()
    await buildLoadContext(c)

    // Exactly one context.set call, carrying the canonical RequestContext
    // itself (identity) — the CSP nonce rides inside it.
    expect(routerContextSetMock).toHaveBeenCalledTimes(1)
    const rc = routerContextSetMock.mock.calls[0]![1]
    expect(rc).toBe(c.var.requestContext)
    expect(rc.cspNonce).toBe('test-nonce-123')
  })
})
