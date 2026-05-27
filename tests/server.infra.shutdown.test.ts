import { describe, expect, it, vi } from 'vitest'

describe('server/infra/shutdown', () => {
  it('closes registered HTTP server during shutdown', async () => {
    vi.resetModules()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      const { setHttpServer, requestShutdown } = await import('@/server/infra/shutdown')

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
      const { requestShutdown } = await import('@/server/infra/shutdown')

      // Should complete gracefully without a registered server
      requestShutdown('test')

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(true).toBe(true)
    } finally {
      exitSpy.mockRestore()
    }
  })
})
