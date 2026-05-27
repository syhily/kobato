import type { ServerType } from '@hono/node-server'
import type { Server as NodeHttpServer } from 'node:http'

import { getLogger } from '@/server/infra/logger'

const log = getLogger('shutdown')

const DEFAULT_CLOSE_TIMEOUT_MS = 30_000

type ShutdownHook = () => Promise<void>

const hooks: ShutdownHook[] = []
let httpServer: ServerType | null = null
let shuttingDown = false
let restartState: 'idle' | 'restarting' = 'idle'

export function registerShutdownHook(hook: ShutdownHook): void {
  hooks.push(hook)
}

export function setHttpServer(server: ServerType): void {
  httpServer = server
}

export async function closeHttpServer(timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS): Promise<void> {
  if (!httpServer) {
    return
  }
  const nodeServer = httpServer as NodeHttpServer
  nodeServer.closeIdleConnections?.()

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      log.warn(`HTTP server close timed out after ${timeoutMs}ms, forcing remaining connections closed`)
      nodeServer.closeAllConnections?.()
    }, timeoutMs)

    httpServer!.close((err) => {
      clearTimeout(timer)
      if (err) {
        log.warn('HTTP server close error', { err: String(err) })
      }
      // Node.js server.close() callback fires at most once.
      // eslint-disable-next-line promise/no-multiple-resolved
      resolve()
    })
  })
}

export function getRestartState(): 'idle' | 'restarting' {
  return restartState
}

export function setRestartState(state: 'idle' | 'restarting'): void {
  restartState = state
  log.info('Restart state changed', { state })
}

export function requestShutdown(reason: string): void {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  log.info('Shutdown requested', { reason })
  void performShutdown(reason)
}

async function performShutdown(reason: string): Promise<void> {
  const forceExit = setTimeout(() => {
    log.warn('Graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  await closeHttpServer(8_000)

  for (const hook of hooks) {
    try {
      await hook()
    } catch (err) {
      log.warn('Shutdown hook failed', { err: String(err) })
    }
  }

  clearTimeout(forceExit)
  log.info('Graceful shutdown complete', { reason })
  process.exit(0)
}

process.once('SIGTERM', () => requestShutdown('SIGTERM'))
process.once('SIGINT', () => requestShutdown('SIGINT'))
