import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { makeRequestContext } from '#/_helpers/request-context'
import { requestContext } from '@/server/http/request-context'

// Contract test for the four hand-written glue seams between Hono, oRPC,
// and React Router (ADR-0003 / ADR-0005): "touch the glue, break a test".
// Bridge header-merge behavior is pinned separately in app.test.ts.

const handlerHandleMock = vi.fn<(_req: Request, opts: { context: any }) => Promise<{ matched: boolean }>>()

vi.mock('@orpc/server/fetch', () => ({
  RPCHandler: function RPCHandlerMock() {
    return { handle: handlerHandleMock }
  },
}))

vi.mock('@/server/http/api-router', () => ({
  apiRouter: { mock: true },
}))

vi.mock('@/server/http/middlewares/csrf', () => ({
  csrfGuard: vi.fn(async (_c: any, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/dynamic-body-limit', () => ({
  dynamicBodyLimit: vi.fn(() => async (_c: any, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: vi.fn(async () => ({})),
}))

// db-lifecycle migrates a database at module-import time — keep it mocked.
vi.mock('@/server/bootstrap/db-lifecycle', () => ({
  getDb: vi.fn(() => ({})),
}))

const { configureMiddleware, buildLoadContext } = await import('@/server/http/middleware-pipeline')
const { createApiApp } = await import('@/server/http/app')
const { trailingSlashNormaliser } = await import('@/server/http/middlewares/trailing-slash')
const { honoWpDecoyMiddleware } = await import('@/server/http/middlewares/wp-decoy')
const { requestContextMiddleware } = await import('@/server/http/middlewares/request-context')
const { honoInstallGateMiddleware } = await import('@/server/http/middlewares/install-gate')
const { honoVisitorCookieMiddleware } = await import('@/server/http/middlewares/visitor-cookie')

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

    // Registration order is semantics: context derives before its consumers, decoys short-circuit first.
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
    // The dirty-marking channel must never leak into the oRPC surface (ADR-0003).
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

describe('glue contract / entry.server export surface', () => {
  it('keeps the default export, streamTimeout, and handleError', async () => {
    const entry = await import('@/entry.server')

    expect(typeof entry.default).toBe('function')
    expect(entry.streamTimeout).toBe(5_000)
    // Pinned by ADR-0005 — replaces React Router's default console.error handler.
    expect(typeof entry.handleError).toBe('function')
  })
})
