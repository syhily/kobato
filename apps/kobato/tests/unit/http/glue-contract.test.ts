import type { Env } from '@kobato/server/http/hono-env.ts'

import { requestContext } from '@kobato/server/http/request-context.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

const handlerHandleMock = vi.fn<(_req: Request, opts: { context: any }) => Promise<{ matched: boolean }>>()

vi.mock('@orpc/server/fetch', () => ({
  RPCHandler: function RPCHandlerMock() {
    return { handle: handlerHandleMock }
  },
}))

vi.mock('@kobato/server/http/api-router.ts', () => ({
  apiRouter: { mock: true },
}))

vi.mock('@kobato/server/http/middlewares/csrf.ts', () => ({
  csrfGuard: vi.fn(async (_c: any, next: () => Promise<void>) => next()),
}))

vi.mock('@kobato/server/http/middlewares/dynamic-body-limit.ts', () => ({
  dynamicBodyLimit: vi.fn(() => async (_c: any, next: () => Promise<void>) => next()),
}))

vi.mock('@kobato/server/domains/settings/services/hydrate.ts', () => ({
  hydrateBlogSettings: vi.fn(async () => ({})),
}))

vi.mock('@kobato/server/bootstrap/db-lifecycle.ts', () => ({
  getDb: vi.fn(() => ({})),
}))

const { configureMiddleware, buildLoadContext } = await import('@kobato/server/http/middleware-pipeline.ts')
const { createApiApp } = await import('@kobato/server/http/app.ts')
const { trustProxy } = await import('@kobato/server/http/middlewares/trust-proxy.ts')
const { trailingSlashNormaliser } = await import('@kobato/server/http/middlewares/trailing-slash.ts')
const { honoWpDecoyMiddleware } = await import('@kobato/server/http/middlewares/wp-decoy.ts')
const { requestContextMiddleware } = await import('@kobato/server/http/middlewares/request-context.ts')
const { honoInstallGateMiddleware } = await import('@kobato/server/http/middlewares/install-gate.ts')

describe('glue contract / middleware pipeline order', () => {
  it('registers the 13 perimeter middlewares in their contract order', () => {
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

    expect(uses).toHaveLength(13)
    expect(uses[0][0]).toBe(trustProxy)
    expect(uses[2][0]).toBeInstanceOf(Function)
    expect(uses[8][0]).toBe(trailingSlashNormaliser)
    expect(uses[9][0]).toBe(honoWpDecoyMiddleware)
    expect(uses[11][0]).toBe(requestContextMiddleware)
    expect(uses[12][0]).toBe(honoInstallGateMiddleware)
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
      'localization',
      'request',
      'requestFacts',
      'responseHeaders',
      'session',
      'settings',
      'viewer',
    ])

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
      'localization',
      'markSessionDirty',
      'requestFacts',
      'session',
      'settings',
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
    const entry = await import('@/entry.server.tsx')

    expect(typeof entry.default).toBe('function')
    expect(entry.streamTimeout).toBe(5_000)

    expect(typeof entry.handleError).toBe('function')
  })
})
