import { initAnalyticsDatabase } from '@/server/bootstrap/analytics-lifecycle'
import { scheduleNextArchive, wireArchiveScheduler } from '@/server/domains/audit/services/scheduler'
import { registerRestoreComplete } from '@/server/domains/backup/restore-orchestrator'
import { resetLikeTokenSweep, startLikeTokenSweep } from '@/server/domains/comments/services/likes'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { wireKvSweepScheduler } from '@/server/infra/cache/kv-maintenance'
import { isVitest } from '@/server/infra/config'
import { flushAllBatchers, initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import {
  closeDatabase,
  openDatabase,
  resolveDatabasePath,
  type Database,
  type DatabaseHandle,
} from '@/server/infra/db/database'
import { wireDbMaintenanceScheduler } from '@/server/infra/db/maintenance'
import { migrateDatabase } from '@/server/infra/db/migrate'
import { registerShutdownHook, restartServer, setRestartDb, setRestartRefreshSettings } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'
// Load-bearing side-effect imports: each batcher module self-registers
// on the infra batching seam (`@/server/infra/db/batcher-registry`) at
// import time, so `initAllBatchers` / `flushAllBatchers` /
// `resetAllBatchers` below cover every batcher with no per-domain calls.
import '@/server/domains/analytics/services/batcher'
import '@/server/domains/analytics/services/pv-batcher'
import '@/server/domains/audit/services/batcher'

// ─── HMR-safe resource creation ──────────────────────────
// In dev, React Router re-evaluates server.ts on every HMR cycle.
// import.meta.hot.data persists across those re-evaluations so the
// handle, Drizzle instance, and migration flag survive without
// leaking connections or re-running completed migrations.

function isHmrData(value: unknown): value is {
  handle?: DatabaseHandle
  migrationsRan?: boolean
} {
  if (!isRecord(value)) {
    return false
  }
  const { handle, migrationsRan } = value
  return (
    (handle === undefined || typeof handle === 'object') &&
    (migrationsRan === undefined || typeof migrationsRan === 'boolean')
  )
}

const hmr = isHmrData(import.meta.hot?.data) ? import.meta.hot.data : undefined

let current!: DatabaseHandle

function wireDatabase(handle: DatabaseHandle): DatabaseHandle {
  current = handle
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.handle = handle
  }
  setRestartDb(handle.db)
  setRestartRefreshSettings(refreshBlogSettings)
  wireArchiveScheduler({ getDb })
  wireKvSweepScheduler({ getDb })
  wireDbMaintenanceScheduler({ getHandle: () => current })
  initAllBatchers(handle)
  startLikeTokenSweep(handle.db)
  return handle
}

function initDatabase() {
  wireDatabase(hmr?.handle ?? openDatabase(resolveDatabasePath()))
}

initDatabase()

// The DuckDB sidecar opens alongside the content database (its own
// shutdown hook at priority 0 runs after the batcher flushes at 100).
if (!isVitest()) {
  await initAnalyticsDatabase()
}

// ─── Restore completion ──────────────────────────────────
// Register restore completion: reopen the database when the restore
// flow didn't already (the orchestrator reopens itself on the success
// path so post-restore validation runs against the NEW file; a failed
// restore still needs the ORIGINAL file reopened for recovery), run
// migrations + ANALYZE on it, then restart the server.

registerRestoreComplete(async (success, err) => {
  if (!success) {
    root.error({ err: err?.message }, 'Restore failed, restarting server for recovery')
  } else {
    root.info('Restore succeeded, restarting server')
  }

  let recreated = false
  try {
    // Idempotent: the orchestrator already reopened on the success path;
    // a failed restore reopens the ORIGINAL file here for recovery.
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
    // Never restart into a dead handle — the server stays down (phase
    // 'restarting', install gate closed) rather than 500ing every
    // request against the closed database.
    root.error('Restore completion aborted: no live database handle; server not restarted')
    return
  }

  try {
    try {
      await migrateDatabase(getDb())
      root.info('Database migrations completed after restore')
      // Restore is a bulk load — refresh planner statistics for the
      // swapped-in file (plan §1.9).
      getDatabaseHandle().client.exec('ANALYZE')
    } catch (migrateErr) {
      root.error(
        { err: migrateErr instanceof Error ? migrateErr.message : String(migrateErr) },
        'Database migrations failed after restore',
      )
    }
    await restartServer()
    root.info('Restore completion finished, server back online')
  } catch (restartErr) {
    root.error(
      { err: restartErr instanceof Error ? restartErr.message : String(restartErr) },
      'Server restart failed during restore completion',
    )
  }
})

// ─── Migration ───────────────────────────────────────────
// Run migrations once per process (HMR-safe via hmr.migrationsRan).

if (!hmr?.migrationsRan) {
  if (!isVitest()) {
    await migrateDatabase(current.db)
  }
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.migrationsRan = true
  }
}

// ─── Shutdown ────────────────────────────────────────────
// Priority 0 so all batchers (priority 100) flush before close.

registerShutdownHook(async () => {
  closeDatabase(current)
}, 0)

/**
 * Prepare the live database for a file swap (the restore flow's step
 * one): flush every batcher BEFORE the handle closes — buffered audit /
 * page-view rows must land in the pre-swap database, not dead-letter
 * against a closed handle — then reset and close.
 * `flushAllBatchers` isolates per-batcher failures internally, so one
 * stuck batcher never blocks the rest or the swap.
 */
export async function prepareDatabaseForRestore(): Promise<void> {
  await flushAllBatchers()
  resetAllBatchers()
  resetLikeTokenSweep()
  closeDatabase(current)
}

/**
 * Reopen the database on (possibly swapped) files. Called by the restore
 * orchestrator after the swap (so post-restore validation runs against
 * the NEW file) and by the completion handler for recovery after a
 * failed restore — the handle is only reopened when closed.
 */
export async function reopenDatabase(): Promise<DatabaseHandle> {
  if (!current.closed) {
    return current
  }
  return wireDatabase(openDatabase(resolveDatabasePath()))
}

/** `reopenDatabase` for consumers that only need the drizzle instance (the restore orchestrator's `reopenAfterSwap`). */
export async function reopenDb(): Promise<Database> {
  const handle = await reopenDatabase()
  return handle.db
}

export function getDb(): Database {
  return current.db
}

export function getDatabaseHandle(): DatabaseHandle {
  return current
}
