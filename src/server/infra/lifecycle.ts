import type { ServerType } from '@hono/node-server'
import type { Hono } from 'hono'

import { serve } from '@hono/node-server'
import { Server as NodeHttpServer } from 'node:http'

import type { Database } from '@/server/infra/db/database'

import { serverConfig } from '@/server/infra/config'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('lifecycle')

const DEFAULT_CLOSE_TIMEOUT_MS = 30_000

export type ServerPhase = 'booting' | 'running' | 'restarting' | 'failed' | 'shutting-down'

interface ShutdownHook {
  fn: () => Promise<void>
  priority: number
}

type RefreshSettingsFn = (db: Database) => Promise<unknown>

// Typed DI container — explicit shape lets contract tests assert no state leaks to globalThis.
export interface LifecycleContainer {
  serverPhase: ServerPhase
  httpServer: ServerType | null
  shuttingDown: boolean
  hooks: ShutdownHook[]
  currentApp: Hono<any> | null
  currentDb: Database | null
  restartQueue: Promise<void>
  restartPromise: Promise<void> | null
  refreshSettingsFn: RefreshSettingsFn | null
}

const container: LifecycleContainer = {
  serverPhase: 'booting',
  httpServer: null,
  shuttingDown: false,
  hooks: [],
  currentApp: null,
  currentDb: null,
  restartQueue: Promise.resolve(),
  restartPromise: null,
  refreshSettingsFn: null,
}

// Test-only surface so contract tests can inspect the container
// without reaching into closure state.
export function __getLifecycleContainer(): LifecycleContainer {
  return container
}

export function setHttpServer(server: ServerType): void {
  container.httpServer = server
}

export async function closeHttpServer(timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS): Promise<void> {
  if (!container.httpServer || !(container.httpServer instanceof NodeHttpServer)) {
    return
  }
  const nodeServer = container.httpServer
  // Detach up front: close must be idempotent (self-update closes before spawning the replacement).
  container.httpServer = null
  nodeServer.closeIdleConnections?.()

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      log.warn(`HTTP server close timed out after ${timeoutMs}ms, forcing remaining connections closed`)
      nodeServer.closeAllConnections?.()
    }, timeoutMs)

    nodeServer.close((err) => {
      clearTimeout(timer)
      if (err) {
        log.warn('HTTP server close error', { err: String(err) })
      }
      // Node.js server.close() callback fires at most once.
      resolve()
    })
  })
}

/** Register a shutdown hook; higher priority runs first (flush hooks 100, connection-close 0). */
export function registerShutdownHook(hook: () => Promise<void>, priority = 0): void {
  if (container.shuttingDown) {
    log.warn('Shutdown hook registered after shutdown started; ignoring')
    return
  }
  container.hooks.push({ fn: hook, priority })
  container.hooks.sort((a, b) => b.priority - a.priority)
}

/** Remove a hook by identity — batchers dispose theirs on every database reopen so the list can't grow unboundedly. */
export function unregisterShutdownHook(hook: () => Promise<void>): void {
  const index = container.hooks.findIndex((entry) => entry.fn === hook)
  if (index !== -1) {
    container.hooks.splice(index, 1)
  }
}

export function requestShutdown(reason: string): void {
  if (container.shuttingDown) {
    return
  }
  container.shuttingDown = true
  setServerPhase('shutting-down')
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

  for (const { fn } of container.hooks) {
    try {
      await fn()
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
// Windows console control events: SIGHUP (window closed) / SIGBREAK (Ctrl+Break)
// stand in for SIGTERM (no delivery there); on POSIX they extend graceful shutdown.
process.once('SIGHUP', () => requestShutdown('SIGHUP'))
process.once('SIGBREAK', () => requestShutdown('SIGBREAK'))

// Un-awaited streamed loader promises have no rejection listener until
// turbo-stream serializes them — the default 'throw' mode would kill the
// process (ADR-0005). Do NOT remove while any loader returns one.
export function handleUnhandledRejection(error: unknown): void {
  log.error('Unhandled promise rejection', { err: error instanceof Error ? error.message : String(error) })
}

process.on('unhandledRejection', handleUnhandledRejection)

export function getServerPhase(): ServerPhase {
  return container.serverPhase
}

const VALID_TRANSITIONS: Record<ServerPhase, readonly ServerPhase[]> = {
  booting: ['running', 'restarting', 'failed', 'shutting-down'],
  running: ['restarting', 'shutting-down'],
  restarting: ['running', 'failed', 'shutting-down'],
  failed: ['restarting', 'shutting-down'],
  'shutting-down': [],
}

export function setServerPhase(newPhase: ServerPhase): void {
  if (newPhase === container.serverPhase) {
    return
  }
  const allowed = VALID_TRANSITIONS[container.serverPhase]
  if (!allowed.includes(newPhase)) {
    log.warn('Invalid phase transition', { from: container.serverPhase, to: newPhase })
    return
  }
  container.serverPhase = newPhase
  log.info('Server phase changed', { phase: newPhase })
}

export function setRestartApp(app: Hono<any>): void {
  container.currentApp = app
}

export function setRestartDb(db: Database): void {
  container.currentDb = db
}

export function setRestartRefreshSettings(fn: RefreshSettingsFn): void {
  container.refreshSettingsFn = fn
}

export async function restartServer(): Promise<void> {
  if (container.shuttingDown) {
    log.warn('Restart requested during shutdown; ignoring')
    return
  }
  if (!container.currentApp) {
    return
  }
  if (container.restartPromise) {
    return container.restartPromise
  }

  const app = container.currentApp

  const queued = (async () => {
    const restartLog = log.child({ component: 'restart' })
    restartLog.info('Graceful restart started')
    setServerPhase('restarting')

    try {
      await closeHttpServer()

      const newServer = serve({ fetch: app.fetch.bind(app), port: serverConfig.server.port }, (info) => {
        restartLog.info(`Server restarted on port ${info.port}`)
      })
      setHttpServer(newServer)

      if (container.currentDb && container.refreshSettingsFn) {
        try {
          await container.refreshSettingsFn(container.currentDb)
        } catch (err) {
          restartLog.warn('refreshBlogSettings failed during restart; continuing', {
            err: err instanceof Error ? err.message : String(err),
          })
        }
      }

      setServerPhase('running')
      restartLog.info('Graceful restart complete')
    } catch (err) {
      restartLog.error('Graceful restart failed', {
        err: err instanceof Error ? err.message : String(err),
      })
      // Old server is closed and the new one failed — no recovery; flag failed so health checks report 503.
      setServerPhase('failed')
      throw err
    }
  })()

  container.restartPromise = queued
  // Sequential queue; swallowed rejections surface to the caller via the returned `queued` promise.
  container.restartQueue = container.restartQueue
    .then(() => queued)
    .catch(() => queued)
    .catch(() => {
      /* swallow queue-chain rejections */
    })

  queued
    .finally(() => {
      container.restartPromise = null
    })
    .catch(() => {
      /* swallow — caller receives error via returned queued promise */
    })

  return queued
}
