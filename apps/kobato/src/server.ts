import type { Env } from '@kobato/server/http/hono-env'

import { serve } from '@hono/node-server'
import { getDb } from '@kobato/server/bootstrap/db-lifecycle'
import { getSetupToken } from '@kobato/server/domains/auth/setup-token'
import { upgradeObservabilityProvisioningAtBoot } from '@kobato/server/domains/observability/provision'
import { syncObservabilityRetention } from '@kobato/server/domains/observability/retention'
import { syncObservabilityRuntime } from '@kobato/server/domains/observability/runtime-manager'
import { getInstallState } from '@kobato/server/domains/settings/install-gate'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core'
import { hydrateBlogSettings, refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { migrateSecretsEncryption } from '@kobato/server/domains/settings/services/migrate-secrets'
import { wrapFetchWithLeakedResponseHandler } from '@kobato/server/http/leaked-response'
import { buildLoadContext, configureMiddleware } from '@kobato/server/http/middleware-pipeline'
import { serverConfig } from '@kobato/server/infra/config'
import { createHonoServer } from '@kobato/server/infra/hono/node'
import { getProcessPool } from '@kobato/server/infra/image/process-pool'
import { startAllRegisteredJobs } from '@kobato/server/infra/job-registry'
import { setHttpServer, setRestartApp, setServerPhase } from '@kobato/server/infra/lifecycle'
import { root } from '@kobato/server/infra/logger'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { isRecord } from '@kobato/utils/type-guards'
import '@kobato/server/domains/analytics/geoip/scheduler'
import '@kobato/server/domains/audit/services/scheduler'
import '@kobato/server/domains/auth/token-purge-scheduler'
import '@kobato/server/domains/backup/scheduler'
import '@kobato/server/domains/content/scheduled-publish'
import '@kobato/server/domains/webmentions/inbox-scheduler'
import '@kobato/server/domains/webmentions/outbox-scheduler'
import '@kobato/server/domains/webmentions/reverify-scheduler'
import '@kobato/server/infra/cache/kv-maintenance'
import '@kobato/server/infra/db/maintenance'

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
  async getLoadContext(c) {
    return buildLoadContext(c)
  },
})

wrapFetchWithLeakedResponseHandler(app)

setRestartApp(app)

if (!hmr?.secretsMigrated) {
  await migrateSecretsEncryption(getDb())
  await refreshBlogSettings(getDb())
}

await hydrateBlogSettings(getDb())
await syncObservabilityRuntime()

void upgradeObservabilityProvisioningAtBoot({
  site: getBlogSettingsBundleSync()?.observability?.observability ?? null,
  writeSettings: (patch) =>
    updateBlogSettingsSection(getDb(), 'observability', { observability: patch }, null).then(() => undefined),
})

void syncObservabilityRetention()
if (!hmr?.secretsMigrated) {
  startAllRegisteredJobs()

  if (hmr) {
    hmr.secretsMigrated = true
  }
}

try {
  if ((await getInstallState(getDb())) === 'noAdmin') {
    await getSetupToken(getDb())
  }
} catch (err) {
  root.warn(
    { err: err instanceof Error ? err.message : String(err) },
    'Failed to generate setup token on startup; will retry on first visit to /admin/setup',
  )
}

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
