import type { ServerType } from '@hono/node-server'

import { Server as NodeHttpServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getServerPhase, restartServer, setHttpServer, setRestartApp, setServerPhase } from '@/server/infra/lifecycle'

vi.mock('@hono/node-server', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@hono/node-server')>()
  return {
    ...mod,
    serve: vi.fn().mockReturnValue({
      close: vi.fn(),
      closeIdleConnections: vi.fn(),
    } as unknown as ServerType),
  }
})

const { serve } = await import('@hono/node-server')
const serveMock = vi.mocked(serve)

describe('server/http/restart — restartServer', () => {
  beforeEach(() => {
    serveMock.mockClear()
  })

  afterEach(() => {
    setServerPhase('running')
  })

  it('sets phase to running even when httpServer is null (dev mode)', async () => {
    const fakeApp = { fetch: vi.fn() } as unknown as Parameters<typeof setRestartApp>[0]
    setRestartApp(fakeApp)
    setServerPhase('restarting')
    await restartServer()
    expect(getServerPhase()).toBe('running')
  })

  it('does nothing when already restarting', async () => {
    const closeMock = vi.fn((cb: () => void) => cb())
    const fakeServer = new NodeHttpServer()
    Object.assign(fakeServer, {
      close: closeMock,
      closeIdleConnections: vi.fn(),
    })

    const fakeApp = { fetch: vi.fn() } as unknown as Parameters<typeof setRestartApp>[0]

    setHttpServer(fakeServer as unknown as ServerType)
    setRestartApp(fakeApp)
    setServerPhase('restarting')

    const p1 = restartServer()
    const p2 = restartServer()
    await Promise.all([p1, p2])

    // Only the first one should have attempted to close the server
    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(serveMock).toHaveBeenCalledTimes(1)
  })

  it('sets phase to failed when restart crashes', async () => {
    const closeMock = vi.fn((cb: () => void) => cb())
    const fakeServer = new NodeHttpServer()
    Object.assign(fakeServer, {
      close: closeMock,
      closeIdleConnections: vi.fn(),
    })

    serveMock.mockImplementationOnce(() => {
      throw new Error('port in use')
    })

    const fakeApp = { fetch: vi.fn() } as unknown as Parameters<typeof setRestartApp>[0]
    setHttpServer(fakeServer as unknown as ServerType)
    setRestartApp(fakeApp)
    setServerPhase('restarting')

    await expect(restartServer()).rejects.toThrow('port in use')
    expect(getServerPhase()).toBe('failed')
  })
})
