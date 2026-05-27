import type { ServerType } from '@hono/node-server'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Hono } from 'hono'
import type { Server as NodeHttpServer } from 'node:http'

import { serve } from '@hono/node-server'

import type { Env } from '@/server/http/context'

import { isVitest, PORT } from '@/server/infra/env'
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

// ─── Internal state ──────────────────────────────────────

let serverPhase: ServerPhase = 'booting'
let httpServer: ServerType | null = null
let shuttingDown = false
const hooks: ShutdownHook[] = []
let currentApp: Hono<Env> | null = null
let currentDb: NodePgDatabase | null = null
let restartPromise: Promise<void> | null = null
let restoreState: RestoreState = { phase: 'idle', startedAt: '' }
let refreshSettingsFn: RefreshSettingsFn | null = null

// ─── HTTP Server ─────────────────────────────────────────

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
    const server = httpServer
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
  if (shuttingDown) {
    log.warn('Shutdown hook registered after shutdown started; ignoring')
    return
  }
  hooks.push({ fn: hook, priority })
}

export function requestShutdown(reason: string): void {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
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

  // Run hooks in priority-descending order so flushers (100) run before
  // connection-closers (0).
  const sorted = [...hooks].sort((a, b) => b.priority - a.priority)
  for (const { fn } of sorted) {
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
  return serverPhase
}

const VALID_TRANSITIONS: Record<ServerPhase, readonly ServerPhase[]> = {
  booting: ['running', 'restarting', 'failed', 'shutting-down'],
  running: ['restarting', 'shutting-down'],
  restarting: ['running', 'failed', 'shutting-down'],
  failed: ['restarting', 'shutting-down'],
  'shutting-down': [],
}

export function setServerPhase(newPhase: ServerPhase): void {
  if (newPhase === serverPhase) {
    return
  }
  if (!isVitest()) {
    const allowed = VALID_TRANSITIONS[serverPhase]
    if (!allowed.includes(newPhase)) {
      log.warn('Invalid phase transition', { from: serverPhase, to: newPhase })
      return
    }
  }
  serverPhase = newPhase
  log.info('Server phase changed', { phase: newPhase })
}

// ─── Restore State ───────────────────────────────────────

export function setRestoreState(phase: RestorePhase, error?: string): void {
  restoreState = { phase, startedAt: new Date().toISOString(), error }
  log.info('Restore state changed', { phase, err: error })
}

export function getRestoreState(): RestoreState {
  return restoreState
}

export function resetRestoreState(): void {
  restoreState = { phase: 'idle', startedAt: '' }
}

// ─── DI setters ──────────────────────────────────────────

export function setRestartApp(app: Hono<Env>): void {
  currentApp = app
}

export function setRestartDb(db: NodePgDatabase): void {
  currentDb = db
}

export function setRestartRefreshSettings(fn: RefreshSettingsFn): void {
  refreshSettingsFn = fn
}

// ─── Restart ─────────────────────────────────────────────

export async function restartServer(): Promise<void> {
  if (restartPromise) {
    return restartPromise
  }
  if (!currentApp) {
    return
  }
  if (shuttingDown) {
    log.warn('Restart requested during shutdown; ignoring')
    return
  }

  const app = currentApp

  setServerPhase('restarting')

  restartPromise = (async () => {
    const restartLog = log.child({ component: 'restart' })
    restartLog.info('Graceful restart started')

    try {
      await closeHttpServer()

      const newServer = serve({ fetch: app.fetch.bind(app), port: PORT }, (info) => {
        restartLog.info(`Server restarted on port ${info.port}`)
      })
      setHttpServer(newServer)

      if (currentDb && refreshSettingsFn) {
        try {
          await refreshSettingsFn(currentDb)
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
  })().finally(() => {
    restartPromise = null
  })

  return restartPromise
}
