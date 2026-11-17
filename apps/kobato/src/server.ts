import type { Env } from '@kobato/server/http/context.ts'

import { serve } from '@hono/node-server'
import { hasAdmin } from '@kobato/db/operations/user.ts'
import { getDb } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { getSetupToken } from '@kobato/server/domains/auth/setup-token.ts'
import { upgradeObservabilityProvisioningAtBoot } from '@kobato/server/domains/observability/provision.ts'
import { syncObservabilityRetention } from '@kobato/server/domains/observability/retention.ts'
import { syncObservabilityRuntime } from '@kobato/server/domains/observability/runtime-manager.ts'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core.ts'
import { hydrateBlogSettings, refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { migrateSecretsEncryption } from '@kobato/server/domains/settings/services/migrate-secrets.ts'
import { wrapFetchWithLeakedResponseHandler } from '@kobato/server/http/leaked-response.ts'
import { buildLoadContext, configureMiddleware } from '@kobato/server/http/middleware-pipeline.ts'
import { serverConfig } from '@kobato/server/infra/config.ts'
import { createHonoServer } from '@kobato/server/infra/hono/node.ts'
import { getProcessPool } from '@kobato/server/infra/image/process-pool.ts'
import { startAllRegisteredJobs } from '@kobato/server/infra/job-registry.ts'
import { setHttpServer, setRestartApp, setServerPhase } from '@kobato/server/infra/lifecycle.ts'
import { root } from '@kobato/server/infra/logger.ts'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters.ts'
import { isRecord } from '@kobato/shared/utils/type-guards.ts'
// Load-bearing: each job module self-registers on the registry at import time; `startAllRegisteredJobs()` below
// arms them. Registration order is irrelevant — each job computes its own delay.
import '@kobato/server/domains/analytics/geoip-scheduler.ts'
import '@kobato/server/domains/audit/services/scheduler.ts'
import '@kobato/server/domains/auth/token-purge-scheduler.ts'
import '@kobato/server/domains/backup/scheduler.ts'
import '@kobato/server/domains/content/scheduled-publish.ts'
import '@kobato/server/domains/webmentions/inbox-scheduler.ts'
import '@kobato/server/domains/webmentions/outbox-scheduler.ts'
import '@kobato/server/domains/webmentions/reverify-scheduler.ts'
import '@kobato/server/infra/cache/kv-maintenance.ts'
import '@kobato/server/infra/db/maintenance.ts'

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
}

// Runs after settings hydration and before the schedulers start, so background jobs are traced from their first
// run; failures are isolated inside the domain and never block the site.
// HMR can re-evaluate `shared/config/snapshot` (module-level state), so a fresh snapshot module reads back empty;
// `hydrateBlogSettings` is single-flight — cached when the snapshot survived, DB re-read when the module was
// re-created.
await hydrateBlogSettings(getDb())
await syncObservabilityRuntime()

// Best-effort asset upgrade: a verified config whose stored asset fingerprint no longer matches this build
// re-provisions the RUM privacy pipeline and the four dashboards. Fire-and-forget; failures only log.
void upgradeObservabilityProvisioningAtBoot({
  site: getBlogSettingsBundleSync()?.observability?.observability ?? null,
  writeSettings: (patch) =>
    updateBlogSettingsSection(getDb(), 'observability', { observability: patch }, null).then(() => undefined),
})

// Opt-in stream retention: reconciled at boot and on every section save when
// the admin owns the policy (`retentionDays` > 0); 0 leaves OpenObserve
// untouched. Same best-effort posture as the asset upgrade above.
void syncObservabilityRetention()

if (!hmr?.secretsMigrated) {
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
        root.info({ port: info.port }, '🚀 Server started')
        root.info({ url: `http://127.0.0.1:${info.port}` }, '🌍 Local server URL')
        root.info('🏎️ Server started')
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
