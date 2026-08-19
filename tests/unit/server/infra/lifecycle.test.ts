import { Server as NodeHttpServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const serveMock = vi.fn()

vi.mock('@hono/node-server', () => ({
  serve: (...args: unknown[]) => serveMock(...args),
}))

const {
  __getLifecycleContainer: getContainer,
  setHttpServer,
  closeHttpServer,
  registerShutdownHook,
  requestShutdown,
  getServerPhase,
  setServerPhase,
  setRestartApp,
  setRestartGetDb,
  setRestartRefreshSettings,
  restartServer,
  handleUnhandledRejection,
} = await import('@/server/infra/lifecycle')
const { __logCaptureForTests: logCapture, __clearLogCaptureForTests: clearLogCapture } =
  await import('@/server/infra/logger')

describe('lifecycle', () => {
  beforeEach(() => {
    const c = getContainer()
    c.serverPhase = 'booting'
    c.hooks = []
    c.httpServer = null
    c.currentApp = null
    c.restartPromise = null
    c.refreshSettingsFn = null
    c.getDbFn = null
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in booting phase', () => {
    expect(getServerPhase()).toBe('booting')
  })

  it('transitions between valid phases', () => {
    setServerPhase('running')
    expect(getServerPhase()).toBe('running')
    setServerPhase('restarting')
    expect(getServerPhase()).toBe('restarting')
    setServerPhase('running')
    expect(getServerPhase()).toBe('running')
  })

  it('ignores same phase and invalid transitions', () => {
    setServerPhase('booting')
    expect(getServerPhase()).toBe('booting')
    setServerPhase('running')
    setServerPhase('booting')
    expect(getServerPhase()).toBe('running')
  })

  it('registers and sorts shutdown hooks by priority', () => {
    const calls: number[] = []
    registerShutdownHook(async () => {
      calls.push(0)
    }, 0)
    registerShutdownHook(async () => {
      calls.push(100)
    }, 100)
    registerShutdownHook(async () => {
      calls.push(50)
    }, 50)
    expect(getContainer().hooks.map((h) => h.priority)).toEqual([100, 50, 0])
  })

  it('ignores shutdown hooks after shutdown started', () => {
    getContainer().serverPhase = 'shutting-down'
    const fn = vi.fn()
    registerShutdownHook(fn)
    expect(fn).not.toHaveBeenCalled()
    expect(getContainer().hooks).toHaveLength(0)
  })

  it('sets DI references', () => {
    const app = { fetch: vi.fn() } as unknown as Parameters<typeof setRestartApp>[0]
    const db = { id: 'db' }
    const getDb = vi.fn(() => db) as unknown as Parameters<typeof setRestartGetDb>[0]
    const refresh = vi.fn()
    setRestartApp(app)
    setRestartGetDb(getDb)
    setRestartRefreshSettings(refresh)
    expect(getContainer().currentApp).toBe(app)
    expect(getContainer().getDbFn).toBe(getDb)
    expect(getContainer().refreshSettingsFn).toBe(refresh)
  })

  it('closes an http server and resolves when callback fires', async () => {
    const closeFn = vi.fn((cb: (err?: Error) => void) => cb())
    const closeIdleConnections = vi.fn()
    const closeAllConnections = vi.fn()
    const fakeServer = Object.create(NodeHttpServer.prototype)
    fakeServer.close = closeFn
    fakeServer.closeIdleConnections = closeIdleConnections
    fakeServer.closeAllConnections = closeAllConnections
    setHttpServer(fakeServer)
    await closeHttpServer()
    expect(closeIdleConnections).toHaveBeenCalled()
    expect(closeFn).toHaveBeenCalled()
  })

  it('skips close when http server is missing or not a Node server', async () => {
    await expect(closeHttpServer()).resolves.toBeUndefined()
  })

  it('detaches the server on close so a second close is a no-op', async () => {
    // Close must be idempotent after the self-update restart's own close (audit P0-7).
    const closeFn = vi.fn((cb: (err?: Error) => void) => cb())
    const fakeServer = Object.create(NodeHttpServer.prototype)
    fakeServer.close = closeFn
    setHttpServer(fakeServer)
    await closeHttpServer()
    expect(getContainer().httpServer).toBeNull()
    await closeHttpServer()
    expect(closeFn).toHaveBeenCalledOnce()
  })

  it('requests shutdown and runs hooks', async () => {
    vi.useFakeTimers()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const hook = vi.fn().mockResolvedValue(undefined)
    registerShutdownHook(hook, 100)
    requestShutdown('test')
    await vi.advanceTimersByTimeAsync(5)
    expect(getServerPhase()).toBe('shutting-down')
    expect(hook).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
    vi.useRealTimers()
  })

  it('restarts the server when an app is available', async () => {
    const fakeServer = { close: vi.fn((cb: (err?: Error) => void) => cb()) } as unknown as NodeHttpServer
    const app = { fetch: { bind: vi.fn(() => vi.fn()) } } as unknown as Parameters<typeof setRestartApp>[0]
    setRestartApp(app)
    setHttpServer(fakeServer as Parameters<typeof setHttpServer>[0])
    const info = { port: 3000 }
    serveMock.mockImplementation((cfg: { fetch: unknown }, cb?: (serverInfo: typeof info) => void) => {
      cb?.(info)
      return { close: vi.fn() }
    })
    await restartServer()
    expect(getServerPhase()).toBe('running')
  })

  it('returns early from restart when shutting down', async () => {
    getContainer().serverPhase = 'shutting-down'
    await expect(restartServer()).resolves.toBeUndefined()
  })

  it('returns early from restart when no app is registered', async () => {
    await expect(restartServer()).resolves.toBeUndefined()
  })

  it('does not request shutdown twice', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    requestShutdown('first')
    requestShutdown('second')
    expect(getServerPhase()).toBe('shutting-down')
    // Second requestShutdown is a no-op: exit fires exactly once.
    await new Promise((resolve) => setImmediate(resolve))
    expect(exitSpy).toHaveBeenCalledOnce()
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
  })

  it('runs refresh settings during restart and continues on failure', async () => {
    const fakeServer = { close: vi.fn((cb: (err?: Error) => void) => cb()) } as unknown as NodeHttpServer
    const app = { fetch: { bind: vi.fn(() => vi.fn()) } } as unknown as Parameters<typeof setRestartApp>[0]
    const refresh = vi.fn().mockRejectedValue(new Error('refresh failed'))
    const db = { id: 'db' }
    setRestartApp(app)
    setRestartGetDb(vi.fn(() => db) as unknown as Parameters<typeof setRestartGetDb>[0])
    setRestartRefreshSettings(refresh)
    setHttpServer(fakeServer as Parameters<typeof setHttpServer>[0])
    serveMock.mockImplementation(() => ({ close: vi.fn() }))
    await restartServer()
    expect(refresh).toHaveBeenCalledWith(db)
    expect(getServerPhase()).toBe('running')
  })

  it('logs unhandled rejections loudly instead of crashing', () => {
    // Prevents a streamed loader rejection from taking the process down (ADR-0005);
    // the `process.on` registration is not touched to avoid polluting the global.
    clearLogCapture()
    handleUnhandledRejection(new Error('comments query failed'))

    const entries = logCapture().filter((e) => e.scope === 'lifecycle' && e.msg === 'Unhandled promise rejection')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ level: 'error', ctx: { err: 'comments query failed' } })
  })

  it('stringifies non-Error rejection reasons', () => {
    clearLogCapture()
    handleUnhandledRejection('plain rejection')

    const entries = logCapture().filter((e) => e.scope === 'lifecycle' && e.msg === 'Unhandled promise rejection')
    expect(entries).toHaveLength(1)
    expect(entries[0].ctx).toMatchObject({ err: 'plain rejection' })
  })
})
