import type { ServerType } from '@hono/node-server'
import type { Env } from '@kobato/server/http/hono-env'
import type { Hono } from 'hono'

import { getDb } from '@kobato/server/bootstrap/db-lifecycle'
import { readHmrFlag, writeHmrFlag } from '@kobato/server/bootstrap/hmr-state'
import { getSetupToken } from '@kobato/server/domains/auth/setup-token'
import { upgradeObservabilityProvisioningAtBoot } from '@kobato/server/domains/observability/provision'
import { syncObservabilityRetention } from '@kobato/server/domains/observability/retention'
import { syncObservabilityRuntime } from '@kobato/server/domains/observability/runtime-manager'
import { getInstallState } from '@kobato/server/domains/settings/install-gate'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core'
import { hydrateBlogSettings, refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { migrateSecretsEncryption } from '@kobato/server/domains/settings/services/migrate-secrets'
import { createKobatoApp, listenKobato } from '@kobato/server/http/kobato-app'
import { wrapFetchWithLeakedResponseHandler } from '@kobato/server/http/leaked-response'
import { getProcessPool } from '@kobato/server/infra/image/process-pool'
import { startAllRegisteredJobs } from '@kobato/server/infra/job-registry'
import { setHttpServer, setRestartApp, setServerPhase } from '@kobato/server/infra/lifecycle'
import { root } from '@kobato/server/infra/logger'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
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

export type KobatoListener = { mode: 'bind' } | { mode: 'host'; server: ServerType | null }

export interface StartKobatoOptions {
  assetsRoot: string
  listener: KobatoListener
  onListening?: (server: ServerType) => void
}

const SECRETS_MIGRATED = 'secretsMigrated'

export async function startKobato(options: StartKobatoOptions): Promise<Hono<Env>> {
  const app = createKobatoApp(options.assetsRoot)
  wrapFetchWithLeakedResponseHandler(app)
  const listener = options.listener
  const httpServer = listener.mode === 'bind' ? listenKobato(app) : listener.server
  if (httpServer !== null) {
    setHttpServer(httpServer)
    options.onListening?.(httpServer)
  }
  if (listener.mode === 'host' && listener.server !== null) {
    root.info('🚧 Dev server started')
  }

  setRestartApp(app)

  const secretsMigrated = readHmrFlag(SECRETS_MIGRATED)
  if (!secretsMigrated) {
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
  if (!secretsMigrated) {
    startAllRegisteredJobs()

    writeHmrFlag(SECRETS_MIGRATED, true)
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

  setServerPhase('running')

  return app
}
