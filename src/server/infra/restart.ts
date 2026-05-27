import type { ServerType } from '@hono/node-server'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Hono } from 'hono'

import { serve } from '@hono/node-server'

import type { Env } from '@/server/http/context'

import { refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { PORT } from '@/server/infra/env'
import { root } from '@/server/infra/logger'
import { closeHttpServer, setHttpServer, setRestartState } from '@/server/infra/shutdown'

let httpServer: ServerType | null = null
let currentApp: Hono<Env> | null = null
let currentDb: NodePgDatabase | null = null
let isRestarting = false

export function setRestartHttpServer(server: ServerType): void {
  httpServer = server
}

export function setRestartApp(app: Hono<Env>): void {
  currentApp = app
}

export function setRestartDb(db: NodePgDatabase): void {
  currentDb = db
}

export async function restartServer(): Promise<void> {
  if (isRestarting || !currentApp) {
    return
  }
  isRestarting = true
  const log = root.child({ component: 'restart' })
  log.info('Graceful restart started')

  try {
    await closeHttpServer()

    if (httpServer) {
      try {
        if (currentDb) {
          await refreshBlogSettings(currentDb)
        }
      } catch (err) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'refreshBlogSettings failed during restart; continuing',
        )
      }

      httpServer = serve({ fetch: currentApp.fetch.bind(currentApp), port: PORT }, (info) => {
        log.info(`🚀 Server restarted on port ${info.port}`)
      })
      setHttpServer(httpServer)
    } else {
      log.info('No HTTP server to restart (dev mode)')
    }

    setRestartState('idle')
    log.info('Graceful restart complete')
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Graceful restart failed')
    setRestartState('idle')
    throw err
  } finally {
    isRestarting = false
  }
}
