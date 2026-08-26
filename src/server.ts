import { serve } from '@hono/node-server'

import type { Env } from '@/server/http/context'

import { getDb } from '@/server/bootstrap/db-lifecycle'
import { getSetupToken } from '@/server/domains/auth/setup-token'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { migrateSecretsEncryption } from '@/server/domains/settings/services/migrate-secrets'
import { wrapFetchWithLeakedResponseHandler } from '@/server/http/leaked-response'
import { buildLoadContext, configureMiddleware } from '@/server/http/middleware-pipeline'
import { serverConfig } from '@/server/infra/config'
import { hasAdmin } from '@/server/infra/db/operations/user'
import { createHonoServer } from '@/server/infra/hono/node'
import { getProcessPool } from '@/server/infra/image/process-pool'
import { startAllRegisteredJobs } from '@/server/infra/job-registry'
import { setHttpServer, setRestartApp, setServerPhase } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'
// Load-bearing: each background job module self-registers on the registry
// at import time; `startAllRegisteredJobs()` below arms them in one loop.
// Registration order is irrelevant — each job computes its own delay.
import '@/server/domains/analytics/geoip-scheduler'
import '@/server/domains/audit/services/scheduler'
import '@/server/domains/auth/token-purge-scheduler'
import '@/server/domains/backup/scheduler'
import '@/server/domains/content/scheduled-publish'
import '@/server/domains/webmentions/inbox-scheduler'
import '@/server/domains/webmentions/outbox-scheduler'
import '@/server/domains/webmentions/reverify-scheduler'
import '@/server/infra/cache/kv-maintenance'
import '@/server/infra/db/maintenance'

function isHmrData(value: unknown): value is { secretsMigrated?: boolean } {
  if (!isRecord(value)) {
    return false
  }
  const sm = value.secretsMigrated
  return sm === undefined || typeof sm === 'boolean'
}

const hmr = isHmrData(import.meta.hot?.data) ? import.meta.hot.data : undefined

const app = await createHonoServer<Env>({
  autoServe: false,
  configure(app) {
    configureMiddleware(app)
  },
  // Keep `async` — dropping the await on `buildLoadContext` would lose `hydrateBlogSettings`.
  async getLoadContext(c) {
    return buildLoadContext(c)
  },
})

wrapFetchWithLeakedResponseHandler(app)

setRestartApp(app)

// Migrations and settings hydration must finish before schedulers start — else the "Settings not hydrated" race. Block is HMR-safe via `secretsMigrated`.

if (!hmr?.secretsMigrated) {
  await migrateSecretsEncryption(getDb())
  await refreshBlogSettings(getDb())

  startAllRegisteredJobs()

  if (hmr) {
    hmr.secretsMigrated = true
  }
}

// Uninstalled deployments only: emit the setup token at startup for the console/docker logs; errors are swallowed — /admin/setup creates it lazily.

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

// PROD: warm the worker pool up-front — the lazy default would tax the first upload; dev runs sharp inline.
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

const httpServer = import.meta.env.PROD
  ? serve(
      { fetch: app.fetch.bind(app), port: serverConfig.server.port, hostname: serverConfig.server.host },
      (info) => {
        root.info(`🚀 Server started on port ${info.port}`)
        root.info(`🌍 http://127.0.0.1:${info.port}`)
        root.info(`🏎️ Server started`)
      },
    )
  : null

if (httpServer) {
  setHttpServer(httpServer)
}

setServerPhase('running')

if (import.meta.hot) {
  import.meta.hot.accept()
}

export default app
