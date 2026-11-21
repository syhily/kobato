import type { Database, DatabaseHandle } from '@kobato/db/database'

import { NOTIFICATION_SOURCES } from '@kobato/api/contracts/notifications'
import { closeDatabase, openDatabase } from '@kobato/db/database'
import { migrateDatabase } from '@kobato/db/migrate'
import { SEA_DRIZZLE_ASSET_PREFIX } from '@kobato/distribution/sea-assets'
import {
  closeAnalyticsForRestore,
  initAnalyticsDatabase,
  snapshotAnalyticsTo,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import { ManagedEngine } from '@kobato/server/bootstrap/managed-engine'
import { rescheduleGeoipUpdate } from '@kobato/server/domains/analytics/geoip/scheduler'
import { flipBrandingDrivers } from '@kobato/server/domains/assets/services/storage'
import { rescheduleArchive } from '@kobato/server/domains/audit/services/scheduler'
import { wireSessionStorageDb } from '@kobato/server/domains/auth/session-storage'
import { createRestoreCompletion } from '@kobato/server/domains/backup/restore-completion'
import { wireRestoreMachine } from '@kobato/server/domains/backup/restore-machine'
import { rescheduleBackup } from '@kobato/server/domains/backup/scheduler'
import {
  BackupEncryptionMisconfiguredError,
  wireBackupEncryption,
  wireBackupSnapshots,
} from '@kobato/server/domains/backup/services/backup'
import { recoverPreRestoreFiles, sweepStaleRestoreDirs } from '@kobato/server/domains/backup/services/restore'
import { resetLikeTokenSweep, startLikeTokenSweep } from '@kobato/server/domains/comments/services/likes'
import {
  backfillStorageAssetUrls,
  runAssetUrlBackfillOnceAtBoot,
} from '@kobato/server/domains/content/services/asset-url-backfill'
import { notifyAdmins } from '@kobato/server/domains/notifications/service'
import { syncObservabilityRetention } from '@kobato/server/domains/observability/retention'
import { syncObservabilityRuntime } from '@kobato/server/domains/observability/runtime-manager'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core'
import { refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { registerSectionChangeHandler } from '@kobato/server/domains/settings/services/section-changes'
import { runZeaburMailCleanupAtBoot } from '@kobato/server/domains/settings/services/zeabur-mail-cleanup'
import { wireS3Migration } from '@kobato/server/domains/storage/s3-migration'
import { wireWebmentionPostPublishHook } from '@kobato/server/domains/webmentions/enqueue'
import { clearLocalizedOutputs, wipeCacheForRestore } from '@kobato/server/infra/cache/registry'
import { isVitest } from '@kobato/server/infra/config'
import {
  flushAllBatchers,
  initAllBatchers,
  replayAllDeadLetters,
  resetAllBatchers,
} from '@kobato/server/infra/db/batcher-registry'
import {
  sweepOrphanedJobRuns,
  wireJobFailureNotifier,
  wireJobRunRecorder,
} from '@kobato/server/infra/db/job-run-recorder'
import { resolveDatabasePath } from '@kobato/server/infra/db/paths'
import { startQueryDiagnostics } from '@kobato/server/infra/db/query-diagnostics'
import { invalidateMailTransportCache } from '@kobato/server/infra/email/sender'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { setJobHandleGetter } from '@kobato/server/infra/job-registry'
import {
  closeHttpServer,
  setRestartGetDb,
  setRestartRefreshSettings,
  setServerPhase,
} from '@kobato/server/infra/lifecycle'
import '@kobato/server/domains/analytics/services/batcher'
import '@kobato/server/domains/analytics/services/pv-batcher'
import '@kobato/server/domains/audit/services/batcher'
import { getLogger } from '@kobato/server/infra/logger'
import { seaAssetPath } from '@kobato/server/infra/sea/sea'
import { getBlogSettingsBundleSync, requireBlogSettingsSection } from '@kobato/settings/getters'
import { isRecord } from '@kobato/utils/type-guards'

function migrationsRanInHmr(): boolean {
  const data: unknown = import.meta.hot?.data
  return isRecord(data) && data.migrationsRan === true
}

function markMigrationsRanInHmr(): void {
  const hot = import.meta.hot
  if (hot && isRecord(hot.data)) {
    hot.data.migrationsRan = true
  }
}

const engine = new ManagedEngine<DatabaseHandle>(
  {
    open: () => openDatabase(resolveDatabasePath()),
    close: closeDatabase,
  },
  'handle',
)

const migrationLog = getLogger('db:migrations')

async function migrateContentDatabase(db: Database): Promise<void> {
  const embeddedFolder = seaAssetPath(SEA_DRIZZLE_ASSET_PREFIX.replace(/\/$/, ''))
  migrateDatabase(db, {
    migrationsFolder: embeddedFolder ?? undefined,
    embedded: embeddedFolder !== null,
    logger: migrationLog,
  })
}

const JOB_RUN_SOURCE = NOTIFICATION_SOURCES[1]

function wireDatabase(handle: DatabaseHandle): DatabaseHandle {
  setRestartGetDb(getDb)
  setRestartRefreshSettings(refreshBlogSettings)
  wireSessionStorageDb({ getDb })
  wireJobRunRecorder({ getDb })
  wireJobFailureNotifier(({ taskKey, error }) => {
    notifyAdmins(getDb(), {
      titleKey: 'notification.job.failed.title',
      titleParams: { taskKey },
      bodyKey: 'notification.job.failed.body',
      bodyParams: { taskKey, hasError: error !== null ? 'yes' : 'no', error: error ?? '' },
      source: JOB_RUN_SOURCE,
      actionUrl: '/admin/tasks',
    })
  })
  setJobHandleGetter({ getDatabaseHandle: () => engine.get() })
  wireBackupSnapshots({ snapshotAnalyticsTo })
  wireBackupEncryption({
    resolveEncryptionPassword: () => {
      const encryption = getBlogSettingsBundleSync()?.backup?.encryption
      if (encryption?.enabled !== true) {
        return null
      }
      const password = encryption.password?.trim()
      if (password === undefined || password === '') {
        throw new BackupEncryptionMisconfiguredError(descriptorFor('backup.error.encryptionMisconfigured'))
      }
      return password
    },
  })
  wireWebmentionPostPublishHook()
  wireS3Migration({
    persistFlippedStorage: async (db, storage) => {
      const current = requireBlogSettingsSection('assets')
      await updateBlogSettingsSection(db, 'assets', { asset: current.asset, upload: current.upload, storage }, null, {
        allowStorageConfigOverride: true,
      })
    },
    flipBrandingDrivers,
    postSwitchBackfill: async (db) => backfillStorageAssetUrls(db),
  })
  initAllBatchers(handle)
  startLikeTokenSweep(handle.db)
  return handle
}

async function initDatabase(): Promise<void> {
  const handle = wireDatabase(await engine.init())
  sweepOrphanedJobRuns(handle.db)
}

if (!isVitest()) {
  await recoverPreRestoreFiles()
}

await initDatabase()

startQueryDiagnostics()

if (!isVitest()) {
  await initAnalyticsDatabase(getDb())
  void replayAllDeadLetters()
  await sweepStaleRestoreDirs()
}

wireRestoreMachine({
  drain: async () => {
    setServerPhase('restarting')
    await closeHttpServer()
  },
  prepareForSwap: prepareDatabaseForRestore,
  reopenAfterSwap: reopenDatabaseAndGetDb,
  complete: createRestoreCompletion({
    reopenDatabase,
    getDb,
    migrateDatabase: migrateContentDatabase,
    wipeCache: wipeCacheForRestore,
    notifyCacheWipeFailed: () => {
      notifyAdmins(getDb(), {
        titleKey: 'notification.backup.cacheWipeFailed.title',
        bodyKey: 'notification.backup.cacheWipeFailed.body',
      })
    },
  }),
})

const reclaimLocalizedOutputs = () => clearLocalizedOutputs()
registerSectionChangeHandler('general', reclaimLocalizedOutputs)
registerSectionChangeHandler('content', reclaimLocalizedOutputs)
registerSectionChangeHandler('assets', reclaimLocalizedOutputs)
registerSectionChangeHandler('sidebar', reclaimLocalizedOutputs)
registerSectionChangeHandler('fonts', reclaimLocalizedOutputs)
registerSectionChangeHandler('backup', rescheduleBackup)
registerSectionChangeHandler('limits', rescheduleArchive)
registerSectionChangeHandler('mail', invalidateMailTransportCache)
registerSectionChangeHandler('analytics', rescheduleGeoipUpdate)
registerSectionChangeHandler('observability', () =>
  Promise.all([syncObservabilityRuntime(), syncObservabilityRetention()]).then(() => undefined),
)

if (!migrationsRanInHmr()) {
  await migrateContentDatabase(getDb())
  markMigrationsRanInHmr()
}

if (!isVitest()) {
  void (async () => {
    await runAssetUrlBackfillOnceAtBoot(getDb())
    await runZeaburMailCleanupAtBoot(getDb(), (message) => {
      notifyAdmins(getDb(), message)
    })
  })()
}

export async function prepareDatabaseForRestore(): Promise<void> {
  await flushAllBatchers()
  await resetAllBatchers()
  resetLikeTokenSweep()
  await engine.closeForSwap()
  await closeAnalyticsForRestore()
}

export async function reopenDatabase(): Promise<DatabaseHandle> {
  const open = engine.peek()
  if (open !== null) {
    return open
  }
  const handle = wireDatabase(await engine.init())
  await initAnalyticsDatabase(handle.db)
  return handle
}

export async function reopenDatabaseAndGetDb(): Promise<Database> {
  const handle = await reopenDatabase()
  return handle.db
}

export function getDb(): Database {
  return engine.get().db
}

export function getDatabaseHandle(): DatabaseHandle {
  return engine.get()
}
