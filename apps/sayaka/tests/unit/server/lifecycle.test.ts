// @vitest-environment node
import { Server as NodeHttpServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logInfo = vi.fn()
const logWarn = vi.fn()
const logError = vi.fn()

vi.mock('@sayaka/server/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: logInfo,
    warn: logWarn,
    error: logError,
    fatal: vi.fn(),
  }),
}))

const {
  __getLifecycleStateForTests: getState,
  setLifecycleHttpServer,
  closeHttpServer,
  requestShutdown,
  handleUnhandledRejection,
} = await import('@sayaka/server/lifecycle')

function fakeHttpServer(overrides: {
  close?: (cb: (err?: Error) => void) => void
  closeIdleConnections?: () => void
  closeAllConnections?: () => void
}): NodeHttpServer {
  const server = Object.create(NodeHttpServer.prototype)
  server.close = overrides.close ?? ((cb: (err?: Error) => void) => cb())
  server.closeIdleConnections = overrides.closeIdleConnections ?? vi.fn()
  server.closeAllConnections = overrides.closeAllConnections ?? vi.fn()
  return server
}

describe('lifecycle', () => {
  beforeEach(() => {
    const state = getState()
    state.httpServer = null
    state.shuttingDown = false
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('logs unhandled rejections loudly instead of crashing', () => {
    handleUnhandledRejection(new Error('comments query failed'))
    expect(logError).toHaveBeenCalledWith('Unhandled promise rejection', { err: 'comments query failed' })
  })

  it('stringifies non-Error rejection reasons', () => {
    handleUnhandledRejection('plain rejection')
    expect(logError).toHaveBeenCalledWith('Unhandled promise rejection', { err: 'plain rejection' })
  })

  it('closes an http server and resolves when the callback fires', async () => {
    const closeFn = vi.fn((cb: (err?: Error) => void) => cb())
    const closeIdleConnections = vi.fn()
    const server = fakeHttpServer({ close: closeFn, closeIdleConnections })
    setLifecycleHttpServer(server)
    await closeHttpServer()
    expect(closeIdleConnections).toHaveBeenCalled()
    expect(closeFn).toHaveBeenCalled()
  })

  it('skips close when no http server is registered', async () => {
    await expect(closeHttpServer()).resolves.toBeUndefined()
  })

  it('detaches the server on close so a second close is a no-op', async () => {
    const closeFn = vi.fn((cb: (err?: Error) => void) => cb())
    setLifecycleHttpServer(fakeHttpServer({ close: closeFn }))
    await closeHttpServer()
    expect(getState().httpServer).toBeNull()
    await closeHttpServer()
    expect(closeFn).toHaveBeenCalledOnce()
  })

  it('shuts down gracefully on request and exits 0', async () => {
    vi.useFakeTimers()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const closeFn = vi.fn((cb: (err?: Error) => void) => cb())
    setLifecycleHttpServer(fakeHttpServer({ close: closeFn }))
    requestShutdown('SIGTERM')
    await vi.advanceTimersByTimeAsync(5)
    expect(logInfo).toHaveBeenCalledWith('Shutdown requested', { reason: 'SIGTERM' })
    expect(closeFn).toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalledWith('Graceful shutdown complete', { reason: 'SIGTERM' })
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
  })

  it('does not shut down twice', async () => {
    vi.useFakeTimers()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    requestShutdown('first')
    requestShutdown('second')
    await vi.advanceTimersByTimeAsync(5)
    expect(logInfo).toHaveBeenCalledTimes(2)
    expect(exitSpy).toHaveBeenCalledOnce()
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
  })

  it('forces exit after the graceful timeout when the server never closes', async () => {
    vi.useFakeTimers()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const closeAllConnections = vi.fn()
    setLifecycleHttpServer(fakeHttpServer({ close: vi.fn(), closeAllConnections }))
    requestShutdown('SIGINT')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(closeAllConnections).toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalledWith('Graceful shutdown timed out, forcing exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })
})
