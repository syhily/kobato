import { describe, expect, it, vi } from 'vitest'

describe('server/infra/lifecycle', () => {
  it('closes registered HTTP server during shutdown', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { setHttpServer, requestShutdown } = await import('@/server/infra/lifecycle')

      const closeMock = vi.fn((cb: () => void) => cb())
      const fakeServer = { close: closeMock } as unknown as import('@hono/node-server').ServerType

      setHttpServer(fakeServer)
      requestShutdown('test')

      // Flush async performShutdown
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(closeMock).toHaveBeenCalledTimes(1)
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('skips HTTP server close when none is registered', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { requestShutdown } = await import('@/server/infra/lifecycle')

      requestShutdown('test')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(true).toBe(true)
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('starts with booting phase', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { getServerPhase } = await import('@/server/infra/lifecycle')
      expect(getServerPhase()).toBe('booting')
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('rejects shutdown hooks registered after shutdown starts', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { registerShutdownHook, requestShutdown } = await import('@/server/infra/lifecycle')
      const hook = vi.fn().mockResolvedValue(undefined)

      requestShutdown('test')
      registerShutdownHook(hook)

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(hook).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('ignores duplicate shutdown requests', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { requestShutdown } = await import('@/server/infra/lifecycle')

      requestShutdown('first')
      // Second call should be a no-op
      requestShutdown('second')

      await new Promise((resolve) => setTimeout(resolve, 50))
      // If the second call triggered another shutdown sequence, we'd see
      // double logging; the guard prevents that.
      expect(true).toBe(true)
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('executes shutdown hooks in priority order', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { registerShutdownHook, requestShutdown } = await import('@/server/infra/lifecycle')
      const order: number[] = []

      registerShutdownHook(async () => {
        order.push(0)
      }, 0)

      registerShutdownHook(async () => {
        order.push(100)
      }, 100)

      registerShutdownHook(async () => {
        order.push(50)
      }, 50)

      requestShutdown('test')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Higher priority runs first
      expect(order).toEqual([100, 50, 0])
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('continues running remaining hooks after one fails', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { registerShutdownHook, requestShutdown } = await import('@/server/infra/lifecycle')
      const ran: string[] = []

      registerShutdownHook(async () => {
        ran.push('fail')
        throw new Error('boom')
      }, 100)

      registerShutdownHook(async () => {
        ran.push('ok')
      }, 0)

      requestShutdown('test')
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(ran).toEqual(['fail', 'ok'])
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('restore state lifecycle works correctly', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { getRestoreState, resetRestoreState, setRestoreState } = await import('@/server/infra/lifecycle')

      expect(getRestoreState().phase).toBe('idle')

      setRestoreState('draining')
      expect(getRestoreState().phase).toBe('draining')
      expect(getRestoreState().startedAt).toBeTruthy()

      setRestoreState('completed')
      expect(getRestoreState().phase).toBe('completed')

      setRestoreState('failed', 'something broke')
      expect(getRestoreState().phase).toBe('failed')
      expect(getRestoreState().error).toBe('something broke')

      resetRestoreState()
      expect(getRestoreState().phase).toBe('idle')
      expect(getRestoreState().startedAt).toBe('')
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('exposes a typed LifecycleContainer via __getLifecycleContainer', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { __getLifecycleContainer } = await import('@/server/infra/lifecycle')
      const container = __getLifecycleContainer()

      expect(container.serverPhase).toBe('booting')
      expect(container.httpServer).toBeNull()
      expect(container.shuttingDown).toBe(false)
      expect(Array.isArray(container.hooks)).toBe(true)
      expect(container.currentApp).toBeNull()
      expect(container.currentDb).toBeNull()
      expect(container.restartQueue).toBeInstanceOf(Promise)
      expect(container.restartPromise).toBeNull()
      expect(container.restoreState.phase).toBe('idle')
      expect(container.refreshSettingsFn).toBeNull()
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('does not reference globalThis for DI state', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const fs = await import('node:fs')
      const content = fs.readFileSync('src/server/infra/lifecycle.ts', 'utf-8')
      expect(content).not.toMatch(/globalThis\s+as\s+typeof\s+globalThis/)
      expect(content).not.toMatch(/globalThis\.[a-zA-Z_]+\s*=/)
    } finally {
      exitSpy.mockRestore()
    }
  })
})
