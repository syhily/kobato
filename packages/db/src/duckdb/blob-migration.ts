import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'
import type { DuckDBLogger } from '@kobato/db/duckdb/logger'
import type { Database } from '@kobato/db/sqlite/database'

import { engineOf } from '@kobato/db/duckdb/connection'
import { findSettingByScope, upsertSetting } from '@kobato/db/sqlite/operations/system/setting'

const BOOT_FLAG_SCOPE = 'system.analytics-blob-migration'

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
  const result = await engineOf(handle).reader.runAndReadAll(
    `SELECT count(*) AS c FROM duckdb_tables() WHERE table_name = 'access_log'`,
  )
  return Number(result.getRowObjects()[0]?.c ?? 0) > 0
}

export async function migrateLegacyAccessLog(handle: AnalyticsHandle): Promise<number | null> {
  if (!(await legacyTableExists(handle))) {
    return null
  }
  const { writer } = engineOf(handle)
  await writer.run('BEGIN TRANSACTION')
  try {
    await writer.run(MIGRATION_SQL)
    const count = await writer.runAndReadAll('SELECT count(*) AS c FROM access_log')
    await writer.run('DROP TABLE access_log')
    await writer.run('COMMIT')
    return Number(count.getRowObjects()[0]?.c ?? 0)
  } catch (error) {
    await writer.run('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export async function runAnalyticsBlobMigrationAtBoot(
  db: Database,
  handle: AnalyticsHandle,
  logger?: DuckDBLogger,
): Promise<void> {
  try {
    if (handle.inMemory) {
      return
    }
    if (!(await legacyTableExists(handle))) {
      if (findSettingByScope(db, BOOT_FLAG_SCOPE) === null) {
        upsertSetting(db, { completedAt: new Date().toISOString(), migratedRows: 0 }, null, BOOT_FLAG_SCOPE)
      }
      return
    }
    const migratedRows = await migrateLegacyAccessLog(handle)
    upsertSetting(db, { completedAt: new Date().toISOString(), migratedRows: migratedRows ?? 0 }, null, BOOT_FLAG_SCOPE)
    logger?.info('Legacy access_log migrated to access_events', { migratedRows })
  } catch (error) {
    logger?.warn('Analytics blob migration failed; will retry on next boot', { error: String(error) })
  }
}
