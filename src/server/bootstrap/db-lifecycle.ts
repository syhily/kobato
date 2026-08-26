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
import { wireBackupSnapshots } from '@/server/domains/backup/services/backup'
import { sweepStaleRestoreDirs } from '@/server/domains/backup/services/restore'
import { resetLikeTokenSweep, startLikeTokenSweep } from '@/server/domains/comments/services/likes'
import {
  backfillStorageAssetUrls,
  runAssetUrlBackfillOnceAtBoot,
} from '@/server/domains/content/services/asset-url-backfill'
import { invalidateImageEnhanceCacheFor } from '@/server/domains/images/services/cache'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { registerSectionChangeHandler } from '@/server/domains/settings/services/section-changes'
import { wireS3Migration } from '@/server/domains/storage/s3-migration'
import { wireWebmentionPostPublishHook } from '@/server/domains/webmentions/enqueue'
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
import { migrateDatabase } from '@/server/infra/db/migrate'
import { invalidateMailTransportCache } from '@/server/infra/email/sender'
import { setJobHandleGetter } from '@/server/infra/job-registry'
import { closeHttpServer, setRestartGetDb, setRestartRefreshSettings, setServerPhase } from '@/server/infra/lifecycle'
// Load-bearing: each batcher module self-registers on the registry at import time.
import '@/server/domains/analytics/services/batcher'
import '@/server/domains/analytics/services/pv-batcher'
import '@/server/domains/audit/services/batcher'
import { requireBlogSettingsSection } from '@/shared/config/getters'
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

function wireDatabase(handle: DatabaseHandle): DatabaseHandle {
  setRestartGetDb(getDb)
  setRestartRefreshSettings(refreshBlogSettings)
  wireSessionStorageDb({ getDb })
  // Background jobs share one lazy handle getter (invoked at fire/evaluate
  // time, so a reopened handle is picked up); the job registry owns their
  // boot start-up.
  setJobHandleGetter({ getDatabaseHandle: () => engine.get() })
  wireBackupSnapshots({ snapshotAnalyticsTo })
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
    invalidateImageMeta: async (db, storagePaths) => {
      for (const storagePath of storagePaths) {
        await invalidateImageEnhanceCacheFor(db, storagePath)
      }
    },
    postSwitchBackfill: async (db) => backfillStorageAssetUrls(db),
  })
  initAllBatchers(handle)
  startLikeTokenSweep(handle.db)
  return handle
}

async function initDatabase(): Promise<void> {
  wireDatabase(await engine.init())
}

await initDatabase()

// Fire-and-forget dead-letter replay: batch files from a crashed flush
// are re-ingested once per boot (each replay logs its own failures).
if (!isVitest()) {
  await initAnalyticsDatabase()
  void replayAllDeadLetters()
  // Fire-and-forget: drop `kobato-restore-*` dirs orphaned by a crash mid-restore.
  void sweepStaleRestoreDirs()
}

wireRestoreMachine({
  drain: async () => {
    setServerPhase('restarting')
    await closeHttpServer()
  },
  prepareForSwap: prepareDatabaseForRestore,
  reopenAfterSwap: reopenDatabaseAndGetDb,
  // The completion chain (rollback → reopen → reschedule → migrate →
  // ANALYZE → restart) lives in the backup domain; only the engine access
  // is wired here.
  complete: createRestoreCompletion({ reopenDatabase, getDb, getDatabaseHandle }),
})

// Composition root: section-change side effects register here, keeping the registry module inert.
registerSectionChangeHandler('backup', rescheduleBackup)
registerSectionChangeHandler('limits', rescheduleArchive)
registerSectionChangeHandler('mail', invalidateMailTransportCache)
registerSectionChangeHandler('analytics', rescheduleGeoipUpdate)

// Migrate once per process (HMR-safe via the 'migrationsRan' slot);
// vitest's per-graph :memory: DBs must migrate themselves.

if (!migrationsRanInHmr()) {
  await migrateDatabase(getDb())
  markMigrationsRanInHmr()
}

// One-time rewrite of legacy baked CDN-absolute asset URLs to the site-owned
// `/storage/<key>` form — flag-gated and failure-swallowing inside; fire-and-
// forget so boot never waits on (or fails on) the corpus scan.
if (!isVitest()) {
  void runAssetUrlBackfillOnceAtBoot(getDb())
}

// The priority-0 shutdown hook (after the priority-100 batcher flushes) lives in the ManagedEngine.

/** Flush every batcher BEFORE the handle closes (rows land in the pre-swap DB, not dead-letter), then reset and close. */
export async function prepareDatabaseForRestore(): Promise<void> {
  await flushAllBatchers()
  resetAllBatchers()
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
  await initAnalyticsDatabase()
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
