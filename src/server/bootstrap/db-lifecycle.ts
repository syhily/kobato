import {
  closeAnalyticsForRestore,
  initAnalyticsDatabase,
  snapshotAnalyticsTo,
} from '@/server/bootstrap/analytics-lifecycle'
import { ManagedEngine } from '@/server/bootstrap/managed-engine'
import { rescheduleGeoipUpdate } from '@/server/domains/analytics/geoip-scheduler'
import { flipBrandingDrivers } from '@/server/domains/assets/services/storage'
import { rescheduleArchive } from '@/server/domains/audit/services/scheduler'
import { wireSessionStorageDb } from '@/server/domains/auth/session-storage'
import { createRestoreCompletion } from '@/server/domains/backup/restore-completion'
import { wireRestoreMachine } from '@/server/domains/backup/restore-machine'
import { rescheduleBackup } from '@/server/domains/backup/scheduler'
import {
  BackupEncryptionMisconfiguredError,
  wireBackupEncryption,
  wireBackupSnapshots,
} from '@/server/domains/backup/services/backup'
import { recoverPreRestoreFiles, sweepStaleRestoreDirs } from '@/server/domains/backup/services/restore'
import { resetLikeTokenSweep, startLikeTokenSweep } from '@/server/domains/comments/services/likes'
import {
  backfillStorageAssetUrls,
  runAssetUrlBackfillOnceAtBoot,
} from '@/server/domains/content/services/asset-url-backfill'
import { notifyAdmins } from '@/server/domains/notifications/service'
import { syncObservabilityRetention } from '@/server/domains/observability/retention'
import { syncObservabilityRuntime } from '@/server/domains/observability/runtime-manager'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { registerSectionChangeHandler } from '@/server/domains/settings/services/section-changes'
import { runZeaburMailCleanupAtBoot } from '@/server/domains/settings/services/zeabur-mail-cleanup'
import { wireS3Migration } from '@/server/domains/storage/s3-migration'
import { wireWebmentionPostPublishHook } from '@/server/domains/webmentions/enqueue'
import { clearLocalizedOutputs, wipeCacheForRestore } from '@/server/infra/cache/registry'
import { isVitest } from '@/server/infra/config'
import {
  flushAllBatchers,
  initAllBatchers,
  replayAllDeadLetters,
  resetAllBatchers,
} from '@/server/infra/db/batcher-registry'
import {
  closeDatabase,
  openDatabase,
  resolveDatabasePath,
  type Database,
  type DatabaseHandle,
} from '@/server/infra/db/database'
import { sweepOrphanedJobRuns, wireJobFailureNotifier, wireJobRunRecorder } from '@/server/infra/db/job-run-recorder'
import { migrateDatabase } from '@/server/infra/db/migrate'
import { startQueryDiagnostics } from '@/server/infra/db/query-diagnostics'
import { invalidateMailTransportCache } from '@/server/infra/email/sender'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { setJobHandleGetter } from '@/server/infra/job-registry'
import { closeHttpServer, setRestartGetDb, setRestartRefreshSettings, setServerPhase } from '@/server/infra/lifecycle'
// Load-bearing: each batcher module self-registers on the registry at import time.
import '@/server/domains/analytics/services/batcher'
import '@/server/domains/analytics/services/pv-batcher'
import '@/server/domains/audit/services/batcher'
import { getBlogSettingsBundleSync, requireBlogSettingsSection } from '@/shared/config/getters'
import { NOTIFICATION_SOURCES } from '@/shared/contracts/notifications'
import { isRecord } from '@/shared/utils/type-guards'

// HMR re-evaluates server.ts per cycle; import.meta.hot.data persists.
// The engine owns the 'handle' slot; this module owns only 'migrationsRan'.

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

const JOB_RUN_SOURCE = NOTIFICATION_SOURCES[1]

function wireDatabase(handle: DatabaseHandle): DatabaseHandle {
  setRestartGetDb(getDb)
  setRestartRefreshSettings(refreshBlogSettings)
  wireSessionStorageDb({ getDb })
  // Job-run history recorder: unwired = silent no-op. Pure setter — the
  // crash-recovery sweep is a boot-only call (see initDatabase).
  wireJobRunRecorder({ getDb })
  // Terminal job failures surface in the admin inbox (deduped per task key
  // inside the recorder); notifyAdmins returns null pre-install, so the
  // pre-install boot stays quiet.
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
  // Background jobs share one lazy handle getter (invoked at fire/evaluate
  // time, so a reopened handle is picked up); the job registry owns their
  // boot start-up.
  setJobHandleGetter({ getDatabaseHandle: () => engine.get() })
  wireBackupSnapshots({ snapshotAnalyticsTo })
  wireBackupEncryption({
    // Live read at backup time: toggling the settings card takes effect on the next
    // backup without a restart. Missing bundle/section (tests) or encryption off = no
    // password. Enabled-but-passwordless fails CLOSED — a plaintext archive must never
    // be written while the UI claims encryption.
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
      // Send the FULL section (asset/upload carried over) — the assets section
      // ships no defaults, so a storage-only patch cannot validate without a
      // stored row. The override flag is reserved for this migration task.
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
  // Crash recovery, boot ONLY: sweep `job_run` rows left `running` by a dead
  // process. The restore rewiring (reopenDatabase → wireDatabase) skips this
  // on purpose — this process's in-flight jobs hold legit `running` rows.
  sweepOrphanedJobRuns(handle.db)
}

// Crash recovery for the restore swap window, BEFORE any engine opens:
// a `.pre-restore` sibling whose live target is missing means the process
// died mid-swap — put the original back before openDatabase would create
// an empty file masquerading as a healthy target.
if (!isVitest()) {
  await recoverPreRestoreFiles()
}

await initDatabase()

// 'sqlite.db.query' channel → debug-level statement timings. Process-level
// and idempotent; a no-op above the debug log level and under vitest.
startQueryDiagnostics()

// Fire-and-forget dead-letter replay: batch files from a crashed flush
// are re-ingested once per boot (each replay logs its own failures).
if (!isVitest()) {
  await initAnalyticsDatabase(getDb())
  void replayAllDeadLetters()
  // Awaited, not fire-and-forget: these sweeps must finish before the
  // server accepts requests — a late readdir could otherwise sweep a temp
  // dir a fresh restore just parked, and a stale `.pre-restore` could be
  // deleted mid-swap by a restore that started milliseconds after boot.
  await sweepStaleRestoreDirs()
  // recoverPreRestoreFiles already ran before the engines opened (it owns
  // the mid-swap crash window).
}

wireRestoreMachine({
  drain: async () => {
    setServerPhase('restarting')
    await closeHttpServer()
  },
  prepareForSwap: prepareDatabaseForRestore,
  reopenAfterSwap: reopenDatabaseAndGetDb,
  // The completion chain (rollback → reopen → reschedule → migrate →
  // ANALYZE → cache wipe → restart) lives in the backup domain; only the
  // engine access and post-restore side effects are wired here.
  complete: createRestoreCompletion({
    reopenDatabase,
    getDb,
    getDatabaseHandle,
    // Regardless of wipe outcome, the registry wrapper drops the process-local
    // generation memo so the next counter read re-reads `_generation`. A
    // partial wipe can still leave residual entries that age out by TTL.
    wipeCache: wipeCacheForRestore,
    notifyCacheWipeFailed: () => {
      notifyAdmins(getDb(), {
        titleKey: 'notification.backup.cacheWipeFailed.title',
        bodyKey: 'notification.backup.cacheWipeFailed.body',
      })
    },
  }),
})

// Composition root: section-change handlers register here, keeping the registry module
// inert. A save advances the snapshot revision, so the previous localized renders are
// unreachable by construction; these handlers only RECLAIM the orphaned entries
// (rename-to-trash), and a reclaim failure reaches the section-change warning channel.
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
// Hot-apply the observability runtime on every save; an unverified or disabled
// fingerprint stops the providers instead of starting them. The opt-in stream
// retention sync rides the same hook (a no-op while `retentionDays` is 0).
registerSectionChangeHandler('observability', () =>
  Promise.all([syncObservabilityRuntime(), syncObservabilityRetention()]).then(() => undefined),
)

// Migrate once per process (HMR-safe via the 'migrationsRan' slot);
// vitest's per-graph :memory: DBs must migrate themselves.

if (!migrationsRanInHmr()) {
  await migrateDatabase(getDb())
  markMigrationsRanInHmr()
}

// One-time rewrite of legacy data (baked CDN-absolute asset URLs → site-owned
// `/storage/<key>`), flag-gated and failure-swallowing inside; fire-and-forget
// so boot never waits on (or fails on) the corpus scan.
if (!isVitest()) {
  void (async () => {
    await runAssetUrlBackfillOnceAtBoot(getDb())
    // Legacy Zeabur mail rows disable themselves here; the admin alert rides
    // the notifications domain, injected so settings never imports it.
    await runZeaburMailCleanupAtBoot(getDb(), (message) => {
      notifyAdmins(getDb(), message)
    })
  })()
}

/** Flush every batcher BEFORE the handle closes (rows land in the pre-swap DB, not dead-letter), then reset and close. */
export async function prepareDatabaseForRestore(): Promise<void> {
  await flushAllBatchers()
  await resetAllBatchers()
  resetLikeTokenSweep()
  await engine.closeForSwap()
  // Close the sidecar after the flush so buffered access events land first.
  await closeAnalyticsForRestore()
}

/** Reopen BOTH databases on (possibly swapped) files; no-op when the content handle is already open. */
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
