import type { ServerType } from '@hono/node-server'
import type { Database } from '@kobato/db/database.ts'
import type { Hono } from 'hono'

import { serve } from '@hono/node-server'
import { serverConfig } from '@kobato/server/infra/config.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { Server as NodeHttpServer } from 'node:http'

const log = getLogger('lifecycle')

const DEFAULT_CLOSE_TIMEOUT_MS = 30_000

export type ServerPhase = 'booting' | 'running' | 'restarting' | 'failed' | 'shutting-down'

interface ShutdownHook {
  fn: () => Promise<void>
  priority: number
}

type RefreshSettingsFn = (db: Database) => Promise<unknown>
type GetDbFn = () => Database

export interface LifecycleContainer {
  serverPhase: ServerPhase
  httpServer: ServerType | null
  hooks: ShutdownHook[]
  currentApp: Hono<any> | null
  restartPromise: Promise<void> | null
  refreshSettingsFn: RefreshSettingsFn | null
  getDbFn: GetDbFn | null
}

const container: LifecycleContainer = {
  serverPhase: 'booting',
  httpServer: null,
  hooks: [],
  currentApp: null,
  restartPromise: null,
  refreshSettingsFn: null,
  getDbFn: null,
}

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
  container.httpServer = null
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
      // Node.js server.close() callback fires at most once.
      resolve()
    })
  })
}

export function registerShutdownHook(hook: () => Promise<void>, priority = 0): void {
  if (container.serverPhase === 'shutting-down') {
    log.warn('Shutdown hook registered after shutdown started; ignoring')
    return
  }
  container.hooks.push({ fn: hook, priority })
  container.hooks.sort((a, b) => b.priority - a.priority)
}

export function unregisterShutdownHook(hook: () => Promise<void>): void {
  const index = container.hooks.findIndex((entry) => entry.fn === hook)
  if (index !== -1) {
    container.hooks.splice(index, 1)
  }
}

export function requestShutdown(reason: string): void {
  if (container.serverPhase === 'shutting-down') {
    return
  }
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

export function setRestartGetDb(fn: GetDbFn): void {
  container.getDbFn = fn
}

export function setRestartRefreshSettings(fn: RefreshSettingsFn): void {
  container.refreshSettingsFn = fn
}

export async function restartServer(): Promise<void> {
  if (container.serverPhase === 'shutting-down') {
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

      const newServer = serve(
        { fetch: app.fetch.bind(app), port: serverConfig.server.port, hostname: serverConfig.server.host },
        (info) => {
          restartLog.info('Server restarted', { port: info.port })
        },
      )
      setHttpServer(newServer)

      if (container.getDbFn && container.refreshSettingsFn) {
        try {
          await container.refreshSettingsFn(container.getDbFn())
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
      setServerPhase('failed')
      throw err
    }
  })()

  container.restartPromise = queued

  queued
    .finally(() => {
      container.restartPromise = null
    })
    .catch(() => undefined)

  return queued
}
