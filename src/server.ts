import { serve } from '@hono/node-server'

import type { Env } from '@/server/http/context'

import { getDb, getPool } from '@/server/bootstrap/db-lifecycle'
import { scheduleNextArchive } from '@/server/domains/audit/services/scheduler'
import { getSetupToken } from '@/server/domains/auth/setup-token'
import { initBackupScheduler, scheduleNextBackup } from '@/server/domains/backup/scheduler'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { migrateSecretsEncryption } from '@/server/domains/settings/services/migrate-secrets'
import { wrapFetchWithLeakedResponseHandler } from '@/server/http/leaked-response'
import { buildLoadContext, configureMiddleware } from '@/server/http/middleware-pipeline'
import { hasAdmin } from '@/server/infra/db/operations/user'
import { PORT } from '@/server/infra/env'
import { createHonoServer } from '@/server/infra/hono/node'
import { setHttpServer, setRestartApp, setServerPhase } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'

const hmr = import.meta.hot?.data as { secretsMigrated?: boolean } | undefined

// ─── Server assembly ─────────────────────────────────────

const app = await createHonoServer<Env>({
  autoServe: false,
  configure(app) {
    configureMiddleware(app)
  },
  // Must be async because `buildLoadContext` awaits `hydrateBlogSettings`.
  // createHonoServer handles both sync and async getLoadContext, but
  // keeping the `async` keyword here makes the promise boundary explicit
  // and prevents a future edit from accidentally dropping the await.
  async getLoadContext(c) {
    // oxlint-disable-next-line typescript/return-await
    return await buildLoadContext(c)
  },
})

wrapFetchWithLeakedResponseHandler(app)

setRestartApp(app)

// ─── Scheduled tasks & startup migrations ────────────────
//
// Run migrations and hydrate settings before starting schedulers
// so they never hit the "Settings not hydrated" race condition.
// The entire block is HMR-safe (guarded by `secretsMigrated`).

if (!hmr?.secretsMigrated) {
  await migrateSecretsEncryption(getDb())
  await refreshBlogSettings(getDb())

  scheduleNextBackup()
  initBackupScheduler()
  scheduleNextArchive(getDb(), getPool())

  if (hmr) {
    hmr.secretsMigrated = true
  }
}

// ─── Setup token (uninstalled deployments only) ──────────
// Generate the one-time setup token on startup so operators can
// read it from the console / docker logs before visiting the
// install wizard.  Swallow errors (e.g. Redis unreachable) — the
// token will be lazily created on the first visit to /admin/setup.

try {
  if (!(await hasAdmin(getDb()))) {
    await getSetupToken()
  }
} catch (err) {
  root.warn(
    { err: err instanceof Error ? err.message : String(err) },
    'Failed to generate setup token on startup; will retry on first visit to /admin/setup',
  )
}

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

setServerPhase('running')

if (import.meta.hot) {
  import.meta.hot.accept()
}

export default app
