import { flushAccessLog, initAccessLogBatcher, resetAccessLogBatcher } from '@/server/domains/analytics/repos/batcher'
import { flushPageViews, initPageViewBatcher, resetPageViewBatcher } from '@/server/domains/analytics/repos/pv-batcher'
import { flushAuditLog, initAuditLogBatcher, resetAuditLogBatcher } from '@/server/domains/audit/repos/batcher'
import { scheduleNextArchive } from '@/server/domains/audit/services/scheduler'
import { registerRestoreComplete } from '@/server/domains/backup/restore-orchestrator'
import { resetLikeTokenSweep, startLikeTokenSweep } from '@/server/domains/comments/services/likes'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { migrateDatabase } from '@/server/infra/db/migrate'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { isVitest } from '@/server/infra/env'
import { registerShutdownHook, restartServer, setRestartDb, setRestartRefreshSettings } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'

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

function initPool() {
  const instance = hmr?.db && hmr?.pool ? { db: hmr.db, pool: hmr.pool } : createDbPool()
  db = instance.db
  pool = instance.pool
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.db = db
    hmr.pool = pool
  }
  setRestartDb(db)
  setRestartRefreshSettings(refreshBlogSettings)
  initAccessLogBatcher(pool)
  initPageViewBatcher(db)
  initAuditLogBatcher(db, pool)
  startLikeTokenSweep(db)
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
      scheduleNextArchive(pool)
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
  try {
    await flushAuditLog()
  } catch (err) {
    root.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Audit log flush failed before pool recreation',
    )
  }
  try {
    await flushAccessLog()
  } catch (err) {
    root.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Access log flush failed before pool recreation',
    )
  }
  try {
    await flushPageViews()
  } catch (err) {
    root.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Page view flush failed before pool recreation',
    )
  }

  const instance = createDbPool()
  db = instance.db
  pool = instance.pool
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.db = db
    hmr.pool = pool
  }
  setRestartDb(db)
  setRestartRefreshSettings(refreshBlogSettings)
  resetAccessLogBatcher()
  resetPageViewBatcher()
  resetAuditLogBatcher()
  initAccessLogBatcher(pool)
  initPageViewBatcher(db)
  initAuditLogBatcher(db, pool)
  resetLikeTokenSweep()
  startLikeTokenSweep(db)
  return instance
}

export function getDb(): typeof db {
  return db
}

export function getPool(): typeof pool {
  return pool
}
