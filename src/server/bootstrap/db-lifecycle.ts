import {
  closeAnalyticsForRestore,
  initAnalyticsDatabase,
  snapshotAnalyticsTo,
} from '@/server/bootstrap/analytics-lifecycle'
import { ManagedEngine } from '@/server/bootstrap/managed-engine'
import { rescheduleGeoipUpdate } from '@/server/domains/analytics/geoip-scheduler'
import { rescheduleArchive, scheduleNextArchive, wireArchiveScheduler } from '@/server/domains/audit/services/scheduler'
import { wireSessionStorageDb } from '@/server/domains/auth/session-storage'
import { wireRestoreMachine } from '@/server/domains/backup/restore-machine'
import { rescheduleBackup, wireBackupScheduler } from '@/server/domains/backup/scheduler'
import { wireBackupSnapshots } from '@/server/domains/backup/services/backup'
import {
  cleanupPreRestoreFiles,
  rollbackPreRestoreFiles,
  sweepStaleRestoreDirs,
} from '@/server/domains/backup/services/restore'
import { resetLikeTokenSweep, startLikeTokenSweep } from '@/server/domains/comments/services/likes'
import { wireScheduledPublishScheduler } from '@/server/domains/content/scheduled-publish'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { registerSectionChangeHandler } from '@/server/domains/settings/services/section-changes'
import { wireWebmentionPostPublishHook } from '@/server/domains/webmentions/enqueue'
import { wireWebmentionInboxScheduler } from '@/server/domains/webmentions/inbox-scheduler'
import { wireWebmentionOutboxScheduler } from '@/server/domains/webmentions/outbox-scheduler'
import { wireWebmentionReverifyScheduler } from '@/server/domains/webmentions/reverify-scheduler'
import { wireKvSweepScheduler } from '@/server/infra/cache/kv-maintenance'
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
import { wireDbMaintenanceScheduler } from '@/server/infra/db/maintenance'
import { migrateDatabase } from '@/server/infra/db/migrate'
import { invalidateMailTransportCache } from '@/server/infra/email/sender'
// Load-bearing: each batcher module self-registers on the registry at import time.
import '@/server/domains/analytics/services/batcher'
import '@/server/domains/analytics/services/pv-batcher'
import '@/server/domains/audit/services/batcher'
import {
  closeHttpServer,
  restartServer,
  setRestartGetDb,
  setRestartRefreshSettings,
  setServerPhase,
} from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
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
  wireArchiveScheduler({ getDb })
  wireBackupScheduler({ getDb })
  wireBackupSnapshots({ snapshotAnalyticsTo })
  wireScheduledPublishScheduler({ getDb })
  wireWebmentionOutboxScheduler({ getDb })
  wireWebmentionInboxScheduler({ getDb })
  wireWebmentionReverifyScheduler({ getDb })
  wireWebmentionPostPublishHook()
  wireKvSweepScheduler({ getDb })
  wireDbMaintenanceScheduler({ getHandle: () => engine.get() })
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

/** The restore machine's completion chain (tests invoke it directly). Idempotent reopen; only the archive job is rescheduled. */
export async function completeRestore(success: boolean, err?: Error): Promise<void> {
  if (!success) {
    root.error({ err: err?.message }, 'Restore failed, restarting server for recovery')
    // Roll back the originals before the recovery reopen.
    try {
      await rollbackPreRestoreFiles()
    } catch (rollbackErr) {
      root.error(
        { err: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr) },
        'Pre-restore rollback failed during restore completion',
      )
    }
  } else {
    root.info('Restore succeeded, restarting server')
  }

  let recreated = false
  try {
    await reopenDatabase()
    recreated = true
  } catch (recreateErr) {
    root.error(
      { err: recreateErr instanceof Error ? recreateErr.message : String(recreateErr) },
      'Database reopen failed during restore completion',
    )
  }

  if (recreated) {
    try {
      scheduleNextArchive()
    } catch (schedErr) {
      root.warn(
        { err: schedErr instanceof Error ? schedErr.message : String(schedErr) },
        'Failed to reschedule archive after restore',
      )
    }
  }

  if (!recreated) {
    // Never restart into a dead handle — stay down rather than 500 against a closed DB.
    root.error('Restore completion aborted: no live database handle; server not restarted')
    return
  }

  try {
    try {
      await migrateDatabase(getDb())
      root.info('Database migrations completed after restore')
      // Bulk-loaded file — refresh planner statistics (plan §1.9).
      getDatabaseHandle().client.exec('ANALYZE')
    } catch (migrateErr) {
      root.error(
        { err: migrateErr instanceof Error ? migrateErr.message : String(migrateErr) },
        'Database migrations failed after restore',
      )
    }
    await restartServer()
    root.info('Restore completion finished, server back online')
    // Success path — drop the pre-restore originals the swap kept.
    if (success) {
      try {
        await cleanupPreRestoreFiles()
      } catch (cleanupErr) {
        root.warn(
          { err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr) },
          'Failed to clean pre-restore originals after a successful restore',
        )
      }
    }
  } catch (restartErr) {
    root.error(
      { err: restartErr instanceof Error ? restartErr.message : String(restartErr) },
      'Server restart failed during restore completion',
    )
  }
}

wireRestoreMachine({
  drain: async () => {
    setServerPhase('restarting')
    await closeHttpServer()
  },
  prepareForSwap: prepareDatabaseForRestore,
  reopenAfterSwap: reopenDatabaseAndGetDb,
  complete: completeRestore,
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
