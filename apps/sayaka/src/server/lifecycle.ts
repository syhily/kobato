import type { ServerType } from '@hono/node-server'

import { getLogger } from '@sayaka/server/logger'
import { Server as NodeHttpServer } from 'node:http'

const log = getLogger('lifecycle')

const GRACEFUL_CLOSE_TIMEOUT_MS = 8_000
const FORCE_EXIT_TIMEOUT_MS = 10_000

interface LifecycleState {
  httpServer: ServerType | null
  shuttingDown: boolean
}

const state: LifecycleState = {
  httpServer: null,
  shuttingDown: false,
}

export function __getLifecycleStateForTests(): LifecycleState {
  return state
}

export function setLifecycleHttpServer(server: ServerType): void {
  state.httpServer = server
}

export async function closeHttpServer(timeoutMs = GRACEFUL_CLOSE_TIMEOUT_MS): Promise<void> {
  if (!state.httpServer || !(state.httpServer instanceof NodeHttpServer)) {
    return
  }
  const nodeServer = state.httpServer
  state.httpServer = null
  nodeServer.closeIdleConnections?.()

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      log.warn('HTTP server close timed out; forcing remaining connections closed', { timeoutMs })
      nodeServer.closeAllConnections?.()
    }, timeoutMs)

    nodeServer.close((err) => {
      clearTimeout(timer)
      if (err) {
        log.warn('HTTP server close error', { err: String(err) })
      }
      resolve()
    })
  })
}

export function requestShutdown(reason: string): void {
  if (state.shuttingDown) {
    return
  }
  state.shuttingDown = true
  log.info('Shutdown requested', { reason })
  void performShutdown(reason)
}

async function performShutdown(reason: string): Promise<void> {
  const forceExit = setTimeout(() => {
    log.warn('Graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, FORCE_EXIT_TIMEOUT_MS)
  forceExit.unref()

  await closeHttpServer()

  clearTimeout(forceExit)
  log.info('Graceful shutdown complete', { reason })
  process.exit(0)
}

process.once('SIGTERM', () => requestShutdown('SIGTERM'))
process.once('SIGINT', () => requestShutdown('SIGINT'))

export function handleUnhandledRejection(error: unknown): void {
  log.error('Unhandled promise rejection', { err: error instanceof Error ? error.message : String(error) })
}

process.on('unhandledRejection', handleUnhandledRejection)
