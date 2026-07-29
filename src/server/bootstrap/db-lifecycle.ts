import { closeAnalyticsForRestore, initAnalyticsDatabase } from '@/server/bootstrap/analytics-lifecycle'
import { ManagedEngine } from '@/server/bootstrap/managed-engine'
import { scheduleNextArchive, wireArchiveScheduler } from '@/server/domains/audit/services/scheduler'
import { wireRestoreMachine } from '@/server/domains/backup/restore-machine'
import { resetLikeTokenSweep, startLikeTokenSweep } from '@/server/domains/comments/services/likes'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
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
// Load-bearing side-effect imports: each batcher module self-registers
// on the infra batching seam (`@/server/infra/db/batcher-registry`) at
// import time, so `initAllBatchers` / `flushAllBatchers` /
// `resetAllBatchers` / `replayAllDeadLetters` below cover every batcher
// with no per-domain calls.
import '@/server/domains/analytics/services/batcher'
import '@/server/domains/analytics/services/pv-batcher'
import '@/server/domains/audit/services/batcher'
import {
  closeHttpServer,
  restartServer,
  setRestartDb,
  setRestartRefreshSettings,
  setServerPhase,
} from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'

// ─── HMR-safe resource creation ──────────────────────────
// In dev, React Router re-evaluates server.ts on every HMR cycle.
// import.meta.hot.data persists across those re-evaluations so the
// handle and the migration flag survive without leaking connections
// or re-running completed migrations. The handle slot is owned by the
// ManagedEngine below ('handle'); this module owns only
// 'migrationsRan'.

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
  setRestartDb(handle.db)
  setRestartRefreshSettings(refreshBlogSettings)
  wireArchiveScheduler({ getDb })
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

// The DuckDB sidecar opens alongside the content database (its own
// shutdown hook at priority 0 runs after the batcher flushes at 100).
// Dead-letter replay follows: batch files written by a crashed flush
// are re-ingested once per boot through the registry (fire-and-forget
// — each replay logs its own failures and keeps the file on error).
if (!isVitest()) {
  await initAnalyticsDatabase()
  void replayAllDeadLetters()
}

// ─── Restore machine wiring ──────────────────────────────
// The composition root wires the restore machine's engine specifics:
// prepare (flush + close), reopen, and completion (recovery reopen
// when the job failed, migrations + ANALYZE, then the restart).

/**
 * The restore machine's completion chain, named so tests invoke it
 * directly instead of capturing a closure off the wire. Idempotent
 * reopen: the machine already reopened on the success path, so this
 * only reopens for recovery after a failed job. Only the archive job
 * is rescheduled here — the other periodic jobs survive the reopen
 * through their handle getters and need nothing.
 */
export async function completeRestore(success: boolean, err?: Error): Promise<void> {
  if (!success) {
    root.error({ err: err?.message }, 'Restore failed, restarting server for recovery')
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

// ─── Migration ───────────────────────────────────────────
// Run migrations once per process (HMR-safe via the 'migrationsRan'
// slot). Always on: vitest workers get an isolated `:memory:` database
// per module graph, so every test file's global must migrate itself —
// idempotent everywhere else.

if (!migrationsRanInHmr()) {
  await migrateDatabase(getDb())
  markMigrationsRanInHmr()
}

// The shutdown hook (priority 0, after the priority-100 batcher
// flushes) lives inside the ManagedEngine.

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
  await engine.closeForSwap()
  // The analytics sidecar swaps too (two-file backup archive): close it
  // after the batcher flush so the buffered access events land first.
  await closeAnalyticsForRestore()
}

/**
 * Reopen BOTH databases on (possibly swapped) files — the analytics
 * sidecar reopens with the content database (closed by
 * prepareDatabaseForRestore; init is a no-op when already open).
 * Called by the restore orchestrator after the swap (so post-restore
 * validation runs against the NEW file) and by the completion handler
 * for recovery after a failed restore — the handle is only reopened
 * when closed.
 */
export async function reopenDatabase(): Promise<DatabaseHandle> {
  const open = engine.peek()
  if (open !== null) {
    return open
  }
  const handle = wireDatabase(await engine.init())
  await initAnalyticsDatabase()
  return handle
}

/** `reopenDatabase` for consumers that only need the drizzle instance (the restore orchestrator's `reopenAfterSwap`). */
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
