import { beforeEach, describe, expect, it, vi } from 'vitest'

const serveStaticMock = vi.hoisted(() => vi.fn(() => (async (_c: any, next: any) => next()) as any))
const serveMock = vi.hoisted(() => vi.fn((_options: unknown, _listener?: unknown) => ({ close: vi.fn() })))
const getBuildModeMock = vi.hoisted(() => vi.fn(() => 'production'))
const getViteDevServerMock = vi.hoisted(() => vi.fn(() => null))
const createRequestHandlerMock = vi.hoisted(() => vi.fn(() => async () => new Response('ok')))

vi.mock('@hono/node-server/serve-static', () => ({
  serveStatic: serveStaticMock,
}))

vi.mock('@hono/node-server', async () => {
  const actual = await vi.importActual<typeof import('@hono/node-server')>('@hono/node-server')
  return {
    ...actual,
    serve: serveMock,
  }
})

vi.mock('@/server/infra/hono/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/server/infra/hono/helpers')>('@/server/infra/hono/helpers')
  return {
    ...actual,
    getBuildMode: getBuildModeMock,
    importBuild: vi.fn(() =>
      Promise.resolve({
        assets: {},
        routes: {},
        entry: { module: {} },
        future: {},
      } as any),
    ),
  }
})

vi.mock('@/server/infra/hono/dev-server-ref', () => ({
  getViteDevServer: getViteDevServerMock,
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    createRequestHandler: createRequestHandlerMock,
  }
})

const { createHonoServer } = await import('@/server/infra/hono/node')

describe('hono node server / createHonoServer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts serveStatic for assets in production', async () => {
    getBuildModeMock.mockReturnValue('production')

    await createHonoServer({ autoServe: false })

    expect(serveStaticMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT mount serveStatic for assets in development', async () => {
    getBuildModeMock.mockReturnValue('development')

    await createHonoServer({ autoServe: false })

    expect(serveStaticMock).not.toHaveBeenCalled()
  })

  it('sets explicit socket timeouts on the production server', async () => {
    getBuildModeMock.mockReturnValue('production')

    await createHonoServer()

    expect(serveMock).toHaveBeenCalledTimes(1)
    expect(serveMock.mock.calls[0]?.[0]).toMatchObject({
      serverOptions: {
        // Headers are cheap: a stalled header write must not get Node's 60s default.
        headersTimeout: 20_000,
        connectionsCheckingInterval: 10_000,
        // The middleware owns the whole-request budget (30s / 30min restore
        // overrides); Node's 300s default would cut off legitimately long
        // backup restores.
        requestTimeout: 0,
      },
    })
  })

  it('forwards a custom node server (https / http2) to serve', async () => {
    getBuildModeMock.mockReturnValue('production')
    const createServer = vi.fn()

    await createHonoServer({ customNodeServer: { createServer } })

    expect(serveMock.mock.calls[0]?.[0]).toMatchObject({ createServer })
  })
})
