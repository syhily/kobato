import type { ServerType } from '@hono/node-server'

import { describe, expect, it, vi } from 'vitest'

import { restartServer, setRestartApp, setRestartHttpServer } from '@/server/infra/restart'
import { getRestartState, setHttpServer, setRestartState } from '@/server/infra/shutdown'

describe('server/http/restart — restartServer', () => {
  it('resets restartState to idle even when httpServer is null (dev mode)', async () => {
    setRestartHttpServer(null as unknown as ServerType)
    const fakeApp = { fetch: vi.fn() } as unknown as Parameters<typeof setRestartApp>[0]
    setRestartApp(fakeApp)
    setRestartState('restarting')
    await restartServer()
    expect(getRestartState()).toBe('idle')
  })

  it('does nothing when already restarting', async () => {
    const closeMock = vi.fn((cb: () => void) => cb())
    const fakeServer = {
      close: closeMock,
      closeIdleConnections: vi.fn(),
    } as unknown as ServerType

    const fakeApp = { fetch: vi.fn() } as unknown as Parameters<typeof setRestartApp>[0]

    setRestartHttpServer(fakeServer)
    setHttpServer(fakeServer)
    setRestartApp(fakeApp)
    setRestartState('restarting')

    // Kick off two concurrent restarts
    const p1 = restartServer()
    const p2 = restartServer()
    await Promise.all([p1, p2])

    // Only the first one should have attempted to close the server
    expect(closeMock).toHaveBeenCalledTimes(1)
    setRestartState('idle')
  })
})
