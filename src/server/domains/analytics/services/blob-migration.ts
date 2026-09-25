import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'
import type { Database } from '@/server/infra/db/database'

import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { getLogger } from '@/server/infra/logger'

/**
 * One-time conversion of the legacy `access_log` table (named columns) to
 * the generic-slot `access_events` schema. Runs once per database at boot
 * (flag-gated on a `system.`-scoped `setting` row), before the batcher
 * accepts writes and under the analytics mutation lock. The whole rewrite
 * is one DuckDB transaction, so a failed/interrupted run leaves `access_log`
 * intact and retries on the next boot; the flag is written only after the
 * old table is dropped. Old backups restore both engines without the flag,
 * so their legacy sidecars upgrade through this same path. The legacy table
 * is probed BEFORE the flag: an analytics-only restore of a pre-rewrite
 * backup into an install whose content DB already carries the flag must
 * still migrate. In-memory sidecars (tests) skip gracefully.
 */

const log = getLogger('analytics.blob-migration')

const BOOT_FLAG_SCOPE = 'system.analytics-blob-migration'

// Old → new column mapping. The raw `ip` column is DISCARDED (it was
// always written NULL), `visitor_hash` becomes blob5, entity scoping
// becomes the `index1` key, and the naive old `ts` round-trips through
// epoch seconds into TIMESTAMPTZ. `browserType` (blob13) has no old
// source and stays ''.
const MIGRATION_SQL = `
INSERT INTO access_events (
  event_id, index1, timestamp, is_bot,
  blob1, blob2, blob3, blob4, blob5, blob6, blob7, blob8,
  blob9, blob10, blob11, blob12, blob13, blob14, blob15, blob16,
  double1, double2
)
SELECT
  uuid(),
  CASE WHEN entity_type IS NOT NULL AND entity_id IS NOT NULL
    THEN entity_type || ':' || CAST(entity_id AS VARCHAR)
    ELSE '' END,
  to_timestamp(epoch(ts)),
  is_bot,
  COALESCE(path, ''),
  COALESCE(referer, ''),
  COALESCE(referer_host, ''),
  COALESCE(ua, ''),
  COALESCE(visitor_hash, ''),
  COALESCE(language, ''),
  COALESCE(country, ''),
  COALESCE(region, ''),
  COALESCE(city, ''),
  COALESCE(timezone, ''),
  COALESCE(os, ''),
  COALESCE(browser, ''),
  '',
  COALESCE(device, ''),
  COALESCE(device_type, ''),
  '',
  latitude,
  longitude
FROM access_log
`

async function legacyTableExists(handle: AnalyticsHandle): Promise<boolean> {
  const result = await handle.reader.runAndReadAll(
    `SELECT count(*) AS c FROM duckdb_tables() WHERE table_name = 'access_log'`,
  )
  return Number(result.getRowObjects()[0]?.c ?? 0) > 0
}

/** Convert `access_log` → `access_events` in one transaction; returns the migrated row count, or null when no legacy table exists. */
export async function migrateLegacyAccessLog(handle: AnalyticsHandle): Promise<number | null> {
  if (!(await legacyTableExists(handle))) {
    return null
  }
  await handle.writer.run('BEGIN TRANSACTION')
  try {
    // Retry-safe by construction: a failed run rolls the whole transaction
    // back, leaving `access_log` intact and `access_events` untouched, so a
    // plain re-run is correct — never DELETE live events here.
    await handle.writer.run(MIGRATION_SQL)
    // Count the SOURCE rows — access_events may already hold live events
    // written while a previous failed migration was being retried.
    const count = await handle.writer.runAndReadAll('SELECT count(*) AS c FROM access_log')
    await handle.writer.run('DROP TABLE access_log')
    await handle.writer.run('COMMIT')
    return Number(count.getRowObjects()[0]?.c ?? 0)
  } catch (error) {
    await handle.writer.run('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export async function runAnalyticsBlobMigrationAtBoot(db: Database, handle: AnalyticsHandle): Promise<void> {
  try {
    if (handle.inMemory) {
      return
    }
    // Probe first, gate second: an analytics-only restore of a pre-rewrite
    // backup into an install whose flag row already exists must still
    // migrate — the flag alone can never prove the legacy table is gone.
    if (!(await legacyTableExists(handle))) {
      if (findSettingByScope(db, BOOT_FLAG_SCOPE) === null) {
        upsertSetting(db, { completedAt: new Date().toISOString(), migratedRows: 0 }, null, BOOT_FLAG_SCOPE)
      }
      return
    }
    const migratedRows = await migrateLegacyAccessLog(handle)
    upsertSetting(db, { completedAt: new Date().toISOString(), migratedRows: migratedRows ?? 0 }, null, BOOT_FLAG_SCOPE)
    log.info('Legacy access_log migrated to access_events', { migratedRows })
  } catch (error) {
    log.warn('Analytics blob migration failed; will retry on next boot', { error: String(error) })
  }
}
