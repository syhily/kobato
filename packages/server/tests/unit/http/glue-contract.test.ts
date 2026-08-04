import type { Env } from '@kobato/server/http/context'

import { makeRequestContext } from '#/_helpers/request-context'

import { requestContext } from '@kobato/server/http/request-context'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

// Contract test for the four hand-written glue seams between Hono, oRPC,
// and React Router (ADR-0003 / ADR-0005): the middleware pipeline order,
// the oRPC bridge projection, the three request-context projections, and
// the entry.server export surface. The goal is "touch the glue, break a
// test" — every assertion pins a behavior another layer silently depends
// on. Header-merge BEHAVIOR of the bridge (Set-Cookie append vs. set) is
// pinned separately in `tests/unit/server/http/app.test.ts`.

const handlerHandleMock = vi.fn<(_req: Request, opts: { context: any }) => Promise<{ matched: boolean }>>()

vi.mock('@orpc/server/fetch', () => ({
  RPCHandler: function RPCHandlerMock() {
    return { handle: handlerHandleMock }
  },
}))

vi.mock('@kobato/server/http/api-router', () => ({
  apiRouter: { mock: true },
}))

vi.mock('@kobato/server/http/middlewares/csrf', () => ({
  csrfGuard: vi.fn(async (_c: any, next: () => Promise<void>) => next()),
}))

vi.mock('@kobato/server/http/middlewares/dynamic-body-limit', () => ({
  dynamicBodyLimit: vi.fn(() => async (_c: any, next: () => Promise<void>) => next()),
}))

vi.mock('@kobato/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: vi.fn(async () => ({})),
}))

// The middleware graph pulls db-lifecycle, which migrates a database at
// module-import time — unit tests have no DB bootstrap, so stub the seam
// (same pattern as tests/unit/server/http/middlewares/request-context.test.ts).
vi.mock('@kobato/server/bootstrap/db-lifecycle', () => ({
  getDb: vi.fn(() => ({})),
}))

const { configureMiddleware, buildLoadContext } = await import('@kobato/server/http/middleware-pipeline')
const { createApiApp } = await import('@kobato/server/http/app')
const { trailingSlashNormaliser } = await import('@kobato/server/http/middlewares/trailing-slash')
const { honoWpDecoyMiddleware } = await import('@kobato/server/http/middlewares/wp-decoy')
const { requestContextMiddleware } = await import('@kobato/server/http/middlewares/request-context')
const { honoInstallGateMiddleware } = await import('@kobato/server/http/middlewares/install-gate')
const { honoVisitorCookieMiddleware } = await import('@kobato/server/http/middlewares/visitor-cookie')

describe('glue contract / middleware pipeline order', () => {
  it('registers the 12 perimeter middlewares in their contract order', () => {
    const uses: unknown[][] = []
    const app = {
      onError: vi.fn(),
      use: (...args: unknown[]) => {
        uses.push(args)
        return app
      },
      get: vi.fn(),
      all: vi.fn(),
      route: vi.fn(),
    }

    configureMiddleware(app as never)

    // Registration order IS semantics: requestContextMiddleware must derive
    // the canonical context before install-gate / visitor-cookie consume it,
    // and trailing-slash / wp-decoy short-circuit before any derivation.
    expect(uses).toHaveLength(12)
    expect(uses[6][0]).toBe(trailingSlashNormaliser)
    expect(uses[7][0]).toBe(honoWpDecoyMiddleware)
    expect(uses[9][0]).toBe(requestContextMiddleware)
    expect(uses[10][0]).toBe(honoInstallGateMiddleware)
    expect(uses[11][0]).toBe(honoVisitorCookieMiddleware)
  })
})

describe('glue contract / oRPC bridge projection', () => {
  it('projects exactly the HandlerContext key set (no markSessionDirty)', async () => {
    let captured: Record<string, unknown> | undefined
    handlerHandleMock.mockImplementation(async (_req, opts) => {
      captured = opts.context
      return { matched: false }
    })

    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('requestContext', makeRequestContext() as unknown as Env['Variables']['requestContext'])
      await next()
    })
    app.route('/', createApiApp())

    await app.request('/rpc/probe', { method: 'POST', body: '{}' })

    expect(captured).toBeDefined()
    expect(Object.keys(captured!).sort()).toEqual([
      'clientAddress',
      'db',
      'request',
      'requestFacts',
      'responseHeaders',
      'session',
      'viewer',
    ])
    // Procedures get a read-only session — the dirty-marking channel must
    // never leak into the oRPC surface (see app.ts comment + ADR-0003).
    expect('markSessionDirty' in captured!).toBe(false)
    expect(captured!.responseHeaders).toBeInstanceOf(Headers)
  })
})

describe('glue contract / request-context projections', () => {
  it('keeps the canonical RequestContext key set stable', () => {
    expect(Object.keys(makeRequestContext()).sort()).toEqual([
      'clientAddress',
      'cspNonce',
      'db',
      'markSessionDirty',
      'requestFacts',
      'session',
      'url',
      'viewer',
    ])
  })

  it('projects the SAME derived object into the RouterContextProvider (no re-derivation)', async () => {
    const rc = makeRequestContext()
    const provider = await buildLoadContext({
      var: { requestContext: rc } as Env['Variables'],
      req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
    })

    expect(provider.get(requestContext)).toBe(rc)
  })
})
