import { serve } from '@hono/node-server'

import type { Env } from '@/server/http/context'

import { getDb, getPool } from '@/server/bootstrap/db-lifecycle'
import { scheduleNextArchive } from '@/server/domains/audit/scheduler'
import { initBackupScheduler, scheduleNextBackup } from '@/server/domains/backup/scheduler'
import { wrapFetchWithLeakedResponseHandler } from '@/server/http/leaked-response'
import { buildLoadContext, configureMiddleware } from '@/server/http/middleware-pipeline'
import { emitEncryptionStartupWarning } from '@/server/infra/crypto/secret-encryption'
import { PORT } from '@/server/infra/env'
import { createHonoServer } from '@/server/infra/hono/node'
import { setHttpServer, setRestartApp, setServerPhase } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'

// ─── Server assembly ─────────────────────────────────────

const app = await createHonoServer<Env>({
  autoServe: false,
  configure(app) {
    configureMiddleware(app)
  },
  getLoadContext(c) {
    return buildLoadContext(c)
  },
})

wrapFetchWithLeakedResponseHandler(app)

setRestartApp(app)

// ─── Start HTTP server ───────────────────────────────────

const httpServer = import.meta.env.PROD
  ? serve({ fetch: app.fetch.bind(app), port: PORT }, (info) => {
      root.info(`🚀 Server started on port ${info.port}`)
      root.info(`🌍 http://127.0.0.1:${info.port}`)
      root.info(`🏎️ Server started`)
    })
  : null

if (httpServer) {
  setHttpServer(httpServer)
}

// ─── Scheduled tasks ─────────────────────────────────────

scheduleNextBackup()
initBackupScheduler()
scheduleNextArchive(getDb(), getPool())
emitEncryptionStartupWarning()

setServerPhase('running')

if (import.meta.hot) {
  import.meta.hot.accept()
}

export default app
