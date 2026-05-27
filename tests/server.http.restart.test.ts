import type { ServerType } from '@hono/node-server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getPhase, restartServer, setHttpServer, setPhase, setRestartApp } from '@/server/infra/lifecycle'

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

  it('sets phase to running even when httpServer is null (dev mode)', async () => {
    const fakeApp = { fetch: vi.fn() } as unknown as Parameters<typeof setRestartApp>[0]
    setRestartApp(fakeApp)
    setPhase('restarting')
    await restartServer()
    expect(getPhase()).toBe('running')
  })

  it('does nothing when already restarting', async () => {
    const closeMock = vi.fn((cb: () => void) => cb())
    const fakeServer = {
      close: closeMock,
      closeIdleConnections: vi.fn(),
    } as unknown as ServerType

    const fakeApp = { fetch: vi.fn() } as unknown as Parameters<typeof setRestartApp>[0]

    setHttpServer(fakeServer)
    setRestartApp(fakeApp)
    setPhase('restarting')

    // Kick off two concurrent restarts
    const p1 = restartServer()
    const p2 = restartServer()
    await Promise.all([p1, p2])

    // Only the first one should have attempted to close the server
    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(serveMock).toHaveBeenCalledTimes(1)
    setPhase('running')
  })
})
