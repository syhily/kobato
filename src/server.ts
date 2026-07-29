import { serve } from '@hono/node-server'

import type { Env } from '@/server/http/context'

import { getDb } from '@/server/bootstrap/db-lifecycle'
import { scheduleNextArchive } from '@/server/domains/audit/services/scheduler'
import { getSetupToken } from '@/server/domains/auth/setup-token'
import { scheduleNextBackup } from '@/server/domains/backup/scheduler'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { migrateSecretsEncryption } from '@/server/domains/settings/services/migrate-secrets'
import { wrapFetchWithLeakedResponseHandler } from '@/server/http/leaked-response'
import { buildLoadContext, configureMiddleware } from '@/server/http/middleware-pipeline'
import { scheduleNextKvSweep } from '@/server/infra/cache/kv-maintenance'
import { serverConfig } from '@/server/infra/config'
import { scheduleNextDbMaintenance } from '@/server/infra/db/maintenance'
import { hasAdmin } from '@/server/infra/db/operations/user'
import { createHonoServer } from '@/server/infra/hono/node'
import { getProcessPool } from '@/server/infra/image/process-pool'
import { setHttpServer, setRestartApp, setServerPhase } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'

function isHmrData(value: unknown): value is { secretsMigrated?: boolean } {
  if (!isRecord(value)) {
    return false
  }
  const sm = value.secretsMigrated
  return sm === undefined || typeof sm === 'boolean'
}

const hmr = isHmrData(import.meta.hot?.data) ? import.meta.hot.data : undefined

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
    return buildLoadContext(c)
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
  scheduleNextArchive()
  scheduleNextKvSweep()
  scheduleNextDbMaintenance()

  if (hmr) {
    hmr.secretsMigrated = true
  }
}

// ─── Setup token (uninstalled deployments only) ──────────
// Generate the one-time setup token on startup so operators can
// read it from the console / docker logs before visiting the
// install wizard.  Swallow errors (e.g. database unreachable) — the
// token will be lazily created on the first visit to /admin/setup.

try {
  if (!(await hasAdmin(getDb()))) {
    await getSetupToken(getDb())
  }
} catch (err) {
  root.warn(
    { err: err instanceof Error ? err.message : String(err) },
    'Failed to generate setup token on startup; will retry on first visit to /admin/setup',
  )
}

// ─── Eagerly warm the sharp worker pool (prod only) ──────
//
// In production we start the worker_threads pool up-front so the first
// upload doesn't pay the ~50ms-per-worker spawn tax. The pool is lazy
// by default (see `getProcessPool`), so this is an optimisation, not a
// hard requirement. Dev skips it — the dev path runs sharp inline.
if (import.meta.env.PROD) {
  try {
    await getProcessPool()
  } catch (err) {
    root.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to warm sharp process pool on startup; will lazy-init on first upload',
    )
  }
}

// ─── Start HTTP server ───────────────────────────────────

const httpServer = import.meta.env.PROD
  ? serve({ fetch: app.fetch.bind(app), port: serverConfig.server.port }, (info) => {
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
