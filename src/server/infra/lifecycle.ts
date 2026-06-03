import type { ServerType } from '@hono/node-server'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Hono } from 'hono'
import type { Server as NodeHttpServer } from 'node:http'

import { serve } from '@hono/node-server'

import { PORT } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('lifecycle')

const DEFAULT_CLOSE_TIMEOUT_MS = 30_000

// ─── Types ─────────────────────────────────────────────────

export type ServerPhase = 'booting' | 'running' | 'restarting' | 'failed' | 'shutting-down'

export type RestorePhase = 'idle' | 'draining' | 'restoring' | 'completed' | 'failed'

export interface RestoreState {
  phase: RestorePhase
  startedAt: string
  error?: string
}

interface ShutdownHook {
  fn: () => Promise<void>
  priority: number
}

type RefreshSettingsFn = (db: NodePgDatabase) => Promise<unknown>

// Typed DI container that replaces the previous 10 module-level `let`
// bindings. The explicit interface makes the container shape reviewable
// and lets contract tests assert that no state leaks to globalThis.
export interface LifecycleContainer {
  serverPhase: ServerPhase
  httpServer: ServerType | null
  shuttingDown: boolean
  hooks: ShutdownHook[]
  currentApp: Hono<any> | null
  currentDb: NodePgDatabase | null
  restartQueue: Promise<void>
  restartPromise: Promise<void> | null
  restoreState: RestoreState
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
  restoreState: { phase: 'idle', startedAt: '' },
  refreshSettingsFn: null,
}

// Test-only surface so contract tests can inspect the container
// without reaching into closure state.
export function __getLifecycleContainer(): LifecycleContainer {
  return container
}

// ─── HTTP Server ─────────────────────────────────────────

export function setHttpServer(server: ServerType): void {
  container.httpServer = server
}

export async function closeHttpServer(timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS): Promise<void> {
  if (!container.httpServer) {
    return
  }
  const nodeServer = container.httpServer as NodeHttpServer
  nodeServer.closeIdleConnections?.()

  await new Promise<void>((resolve) => {
    const server = container.httpServer
    const timer = setTimeout(() => {
      log.warn(`HTTP server close timed out after ${timeoutMs}ms, forcing remaining connections closed`)
      nodeServer.closeAllConnections?.()
    }, timeoutMs)

    server!.close((err) => {
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

// ─── Shutdown ────────────────────────────────────────────

/**
 * Register a shutdown hook. Higher priority runs first.
 * Flush hooks: priority 100. Connection-close hooks: priority 0 (default).
 */
export function registerShutdownHook(hook: () => Promise<void>, priority = 0): void {
  if (container.shuttingDown) {
    log.warn('Shutdown hook registered after shutdown started; ignoring')
    return
  }
  container.hooks.push({ fn: hook, priority })
  container.hooks.sort((a, b) => b.priority - a.priority)
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

// ─── Server Phase ────────────────────────────────────────

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

// ─── Restore State ───────────────────────────────────────

export function setRestoreState(phase: RestorePhase, error?: string): void {
  container.restoreState = { phase, startedAt: new Date().toISOString(), error }
  log.info('Restore state changed', { phase, err: error })
}

export function getRestoreState(): RestoreState {
  return container.restoreState
}

export function resetRestoreState(): void {
  container.restoreState = { phase: 'idle', startedAt: '' }
}

// ─── DI setters ──────────────────────────────────────────

export function setRestartApp(app: Hono<any>): void {
  container.currentApp = app
}

export function setRestartDb(db: NodePgDatabase): void {
  container.currentDb = db
}

export function setRestartRefreshSettings(fn: RefreshSettingsFn): void {
  container.refreshSettingsFn = fn
}

// ─── Restart ─────────────────────────────────────────────

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

      const newServer = serve({ fetch: app.fetch.bind(app), port: PORT }, (info) => {
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
      // Old server is already closed; new server failed to start. There is no
      // recovery — flag the process as failed so health checks report 503.
      setServerPhase('failed')
      throw err
    }
  })()

  container.restartPromise = queued
  // Queue restarts so they run sequentially, but swallow queue-chain
  // rejections so they don't surface as unhandled. The caller awaiting
  // `restartServer()` receives the original error via the returned
  // `queued` promise.
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
