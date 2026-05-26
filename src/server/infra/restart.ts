import type { ServerType } from '@hono/node-server'
import type { Hono } from 'hono'
import type { Server as NodeHttpServer } from 'node:http'

import { serve } from '@hono/node-server'

import type { Env } from '@/server/http/context'

import { refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { PORT } from '@/server/infra/env'
import { root } from '@/server/infra/logger'
import { setHttpServer, setRestartState } from '@/server/infra/shutdown'

let httpServer: ServerType | null = null
let currentApp: Hono<Env> | null = null
let isRestarting = false

export function setRestartHttpServer(server: ServerType): void {
  httpServer = server
}

export function setRestartApp(app: Hono<Env>): void {
  currentApp = app
}

export async function restartServer(): Promise<void> {
  if (isRestarting || !currentApp) {
    return
  }
  isRestarting = true
  const log = root.child({ component: 'restart' })
  log.info('Graceful restart started')

  const CLOSE_TIMEOUT_MS = 30_000

  try {
    if (httpServer) {
      ;(httpServer as NodeHttpServer).closeIdleConnections?.()

      await new Promise<void>((resolve, _reject) => {
        const timer = setTimeout(() => {
          log.warn(`HTTP server close timed out after ${CLOSE_TIMEOUT_MS}ms, forcing remaining connections closed`)
          ;(httpServer as NodeHttpServer).closeAllConnections?.()
        }, CLOSE_TIMEOUT_MS)

        httpServer!.close((err) => {
          clearTimeout(timer)
          if (err) {
            log.warn({ err: String(err) }, 'HTTP server close error')
          }
          resolve()
        })
      })

      try {
        await refreshBlogSettings()
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
