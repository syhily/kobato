import { scheduleNextArchive, wireArchiveScheduler } from '@/server/domains/audit/services/scheduler'
import { registerRestoreComplete } from '@/server/domains/backup/restore-orchestrator'
import { resetLikeTokenSweep, startLikeTokenSweep } from '@/server/domains/comments/services/likes'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { flushAllBatchers, initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { migrateDatabase } from '@/server/infra/db/migrate'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { isVitest } from '@/server/infra/env'
import { registerShutdownHook, restartServer, setRestartDb, setRestartRefreshSettings } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'
// Load-bearing side-effect imports: each batcher module self-registers
// on the infra batching seam (`@/server/infra/db/batcher-registry`) at
// import time, so `initAllBatchers` / `flushAllBatchers` /
// `resetAllBatchers` below cover every batcher with no per-domain calls.
import '@/server/domains/analytics/repos/batcher'
import '@/server/domains/analytics/repos/pv-batcher'
import '@/server/domains/audit/repos/batcher'

// ─── HMR-safe resource creation ──────────────────────────
// In dev, React Router re-evaluates server.ts on every HMR cycle.
// import.meta.hot.data persists across those re-evaluations so the
// Pool, Drizzle instance, and migration flag survive without
// leaking connections or re-running completed migrations.

function isHmrData(value: unknown): value is {
  pool?: ReturnType<typeof createDbPool>['pool']
  db?: ReturnType<typeof createDbPool>['db']
  migrationsRan?: boolean
} {
  if (!isRecord(value)) {
    return false
  }
  const { pool, db, migrationsRan } = value
  return (
    (pool === undefined || typeof pool === 'object') &&
    (db === undefined || typeof db === 'object') &&
    (migrationsRan === undefined || typeof migrationsRan === 'boolean')
  )
}

const hmr = isHmrData(import.meta.hot?.data) ? import.meta.hot.data : undefined

let db!: ReturnType<typeof createDbPool>['db']
let pool!: ReturnType<typeof createDbPool>['pool']

function wirePool(instance: ReturnType<typeof createDbPool>): ReturnType<typeof createDbPool> {
  db = instance.db
  pool = instance.pool
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.db = db
    hmr.pool = pool
  }
  setRestartDb(db)
  setRestartRefreshSettings(refreshBlogSettings)
  wireArchiveScheduler({ getDb })
  initAllBatchers(pool, db)
  startLikeTokenSweep(db)
  return instance
}

function initPool() {
  wirePool(hmr?.db && hmr?.pool ? { db: hmr.db, pool: hmr.pool } : createDbPool())
}

initPool()

// ─── Restore completion ──────────────────────────────────
// Register restore completion: recreate pool, restart server, reset state.

registerRestoreComplete(async (success, err) => {
  if (!success) {
    root.error({ err: err?.message }, 'Restore failed, restarting server for recovery')
  } else {
    root.info('Restore succeeded, restarting server')
  }

  let recreated = false
  try {
    await recreatePool()
    recreated = true
  } catch (recreateErr) {
    root.error(
      { err: recreateErr instanceof Error ? recreateErr.message : String(recreateErr) },
      'Pool recreation failed during restore completion',
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

  try {
    try {
      await migrateDatabase()
      root.info('Database migrations completed after restore')
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
    await migrateDatabase()
  }
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.migrationsRan = true
  }
}

// ─── Shutdown ────────────────────────────────────────────
// Priority 0 so all batchers (priority 100) flush before the pool is closed.

registerShutdownHook(() => closePool(pool), 0)

export async function recreatePool(): Promise<{ db: typeof db; pool: typeof pool }> {
  // flushAllBatchers isolates per-batcher failures internally — a
  // failing flush never blocks the remaining batchers or the pool swap.
  await flushAllBatchers()

  resetAllBatchers()
  resetLikeTokenSweep()
  return wirePool(createDbPool())
}

export function getDb(): typeof db {
  return db
}

export function getPool(): typeof pool {
  return pool
}
