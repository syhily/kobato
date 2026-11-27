import type { ServerType } from '@hono/node-server'

import { HTTP_SERVER_OPTIONS } from '@kobato/base/utils/http-server-options'
import { serverConfig } from '@kobato/server/infra/config'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@hono/node-server', () => ({
  serve: vi.fn(),
}))

const { serve } = await import('@hono/node-server')
const { listenHono } = await import('@kobato/server/infra/http/listener')

const serveMock = vi.mocked(serve)

describe('infra/http/listener', () => {
  beforeEach(() => {
    serveMock.mockReset()
    serveMock.mockReturnValue({ id: 'server' } as unknown as ServerType)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('binds the app on the configured host and port with exactly the unified Node server options', () => {
    const app = new Hono()
    const onListening = vi.fn()

    const server = listenHono({ app, onListening })

    expect(server).toEqual({ id: 'server' })
    expect(serveMock).toHaveBeenCalledTimes(1)
    const [options, listeningListener] = serveMock.mock.calls[0]!
    expect(options).toEqual({
      fetch: expect.any(Function),
      port: serverConfig.server.port,
      hostname: serverConfig.server.host,
      overrideGlobalObjects: false,
      serverOptions: HTTP_SERVER_OPTIONS,
    })
    expect(options.serverOptions).toBe(HTTP_SERVER_OPTIONS)
    expect(listeningListener).toBe(onListening)
  })
})
