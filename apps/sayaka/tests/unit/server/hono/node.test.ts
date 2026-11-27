// @vitest-environment node
import type { ServerType } from '@hono/node-server'

import { HTTP_SERVER_OPTIONS } from '@kobato/base/utils/http-server-options'
import { sayakaConfig } from '@sayaka/server/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@hono/node-server', () => ({
  serve: vi.fn(),
}))

vi.mock('@sayaka/server/hono/build-runtime', () => ({
  importBuild: async () => ({}),
  getBuildMode: () => 'production',
  bindIncomingRequestSocketInfo: () => async (_c: unknown, next: () => Promise<void>) => next(),
}))

const { serve } = await import('@hono/node-server')
const { createHonoServer } = await import('@sayaka/server/hono/node')

const serveMock = vi.mocked(serve)
const fakeServer = { id: 'node-server' } as unknown as ServerType

describe('server/hono/node — createHonoServer', () => {
  beforeEach(() => {
    serveMock.mockReset()
    serveMock.mockReturnValue(fakeServer)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('binds exactly the unified Node server options every Kobato listener binds', async () => {
    const onServe = vi.fn()

    await createHonoServer({ configure: vi.fn(), onServe })

    expect(serveMock).toHaveBeenCalledTimes(1)
    const [options, listeningListener] = serveMock.mock.calls[0]!
    expect(options.fetch).toBeTypeOf('function')
    expect(options.port).toBe(sayakaConfig.port)
    expect(options.hostname).toBe(sayakaConfig.host)
    expect(options.overrideGlobalObjects).toBe(false)
    expect(options.serverOptions).toBe(HTTP_SERVER_OPTIONS)
    expect(listeningListener).toBeTypeOf('function')
    expect(onServe).toHaveBeenCalledWith(fakeServer)
  })

  it('lets a customNodeServer replace the server creation block wholesale', async () => {
    const createServer = vi.fn()
    const serverOptions = { headersTimeout: 1_000, requestTimeout: 60_000, connectionsCheckingInterval: 5_000 }

    await createHonoServer({ configure: vi.fn(), customNodeServer: { createServer, serverOptions } })

    const [options] = serveMock.mock.calls[0]!
    expect(options.createServer).toBe(createServer)
    expect(options.serverOptions).toEqual(serverOptions)
    expect(options.serverOptions).not.toBe(HTTP_SERVER_OPTIONS)
    expect(options.port).toBe(sayakaConfig.port)
  })
})
