import { beforeEach, describe, expect, it, vi } from 'vitest'

const serveStaticMock = vi.hoisted(() => vi.fn(() => (async (_c: any, next: any) => next()) as any))
const getBuildModeMock = vi.hoisted(() => vi.fn(() => 'production'))
const getViteDevServerMock = vi.hoisted(() => vi.fn(() => null))
const createRequestHandlerMock = vi.hoisted(() => vi.fn(() => async () => new Response('ok')))

vi.mock('@hono/node-server/serve-static', () => ({
  serveStatic: serveStaticMock,
}))

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

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}))

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
})
