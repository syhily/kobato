import type { ServerType } from '@hono/node-server'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Hono } from 'hono'
import type { Server as NodeHttpServer } from 'node:http'

import { serve } from '@hono/node-server'

import type { Env } from '@/server/http/context'

import { PORT } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('lifecycle')

const DEFAULT_CLOSE_TIMEOUT_MS = 30_000

type ShutdownHook = () => Promise<void>

export type Phase =
  | 'booting'
  | 'running'
  | 'draining'
  | 'restoring'
  | 'completed'
  | 'failed'
  | 'restarting'
  | 'shutting-down'

export interface RestoreResult {
  phase: 'idle' | 'draining' | 'restoring' | 'completed' | 'failed'
  startedAt: string
  error?: string
}

// ─── Internal state ──────────────────────────────────────

let phase: Phase = 'running'
let httpServer: ServerType | null = null
let shuttingDown = false
let hooks: ShutdownHook[] = []
let currentApp: Hono<Env> | null = null
let currentDb: NodePgDatabase | null = null
let restartPromise: Promise<void> | null = null
let restoreResult: RestoreResult = { phase: 'idle', startedAt: '' }

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

export function registerShutdownHook(hook: ShutdownHook): void {
  if (shuttingDown) {
    log.warn('Shutdown hook registered after shutdown started; ignoring')
    return
  }
  hooks.push(hook)
}

export function requestShutdown(reason: string): void {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  phase = 'shutting-down'
  log.info('Shutdown requested', { reason, phase })
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

// ─── Phase ───────────────────────────────────────────────

export function getPhase(): Phase {
  return phase
}

export function setPhase(newPhase: Phase): void {
  phase = newPhase
  log.info('Phase changed', { phase: newPhase })
}

// ─── Restore Result ──────────────────────────────────────

export function setRestoreResult(phase: RestoreResult['phase'], error?: string): void {
  restoreResult = { phase, startedAt: new Date().toISOString(), error }
  log.info('Restore result changed', { phase, err: error })
}

export function getRestoreResult(): RestoreResult {
  return restoreResult
}

export function resetRestoreResult(): void {
  restoreResult = { phase: 'idle', startedAt: '' }
}

// ─── Restart ─────────────────────────────────────────────

export function setRestartApp(app: Hono<Env>): void {
  currentApp = app
}

export function setRestartDb(db: NodePgDatabase): void {
  currentDb = db
}

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

  restartPromise = (async () => {
    const restartLog = log.child({ component: 'restart' })
    restartLog.info('Graceful restart started')

    try {
      await closeHttpServer()

      const newServer = serve({ fetch: currentApp.fetch.bind(currentApp), port: PORT }, (info) => {
        restartLog.info(`🚀 Server restarted on port ${info.port}`)
      })
      setHttpServer(newServer)

      if (currentDb) {
        try {
          const { refreshBlogSettings } = await import('@/server/domains/settings/snapshot')
          await refreshBlogSettings(currentDb)
        } catch (err) {
          restartLog.warn('refreshBlogSettings failed during restart; continuing', {
            err: err instanceof Error ? err.message : String(err),
          })
        }
      }

      setPhase('running')
      restartLog.info('Graceful restart complete')
    } catch (err) {
      restartLog.error('Graceful restart failed', {
        err: err instanceof Error ? err.message : String(err),
      })
      setPhase('running')
      throw err
    }
  })().finally(() => {
    restartPromise = null
  })

  return restartPromise
}
