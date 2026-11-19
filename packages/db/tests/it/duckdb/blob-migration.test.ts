import type { AnalyticsHandle } from '@kobato/db/duckdb/database.ts'

import { ACCESS_EVENTS_DDL } from '@kobato/db/duckdb/access-events.ts'
import { runAnalyticsBlobMigrationAtBoot } from '@kobato/db/duckdb/blob-migration.ts'
import { openAnalyticsDatabase } from '@kobato/db/duckdb/database.ts'
import { findSettingByScope, upsertSetting } from '@kobato/db/operations/setting.ts'
import { closeTestAnalyticsDb, createTestAnalyticsDb } from '@kobato/test/analytics-db.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

const LEGACY_DDL = `
CREATE TABLE access_log (
  ts              TIMESTAMP NOT NULL,
  visitor_hash    VARCHAR NOT NULL,
  session_id      VARCHAR,
  ip              VARCHAR,
  path            VARCHAR NOT NULL,
  entity_type     VARCHAR,
  entity_id       BIGINT,
  referer         VARCHAR,
  referer_host    VARCHAR,
  country         VARCHAR,
  region          VARCHAR,
  city            VARCHAR,
  latitude        DOUBLE,
  longitude       DOUBLE,
  timezone        VARCHAR,
  language        VARCHAR,
  ua              VARCHAR,
  browser         VARCHAR,
  browser_version VARCHAR,
  os              VARCHAR,
  os_version      VARCHAR,
  device          VARCHAR,
  device_type     VARCHAR,
  is_bot          BOOLEAN NOT NULL
)
`

let handle: AnalyticsHandle

async function tableExists(name: string): Promise<boolean> {
  const result = await handle.reader.runAndReadAll(`SELECT count(*) AS c FROM duckdb_tables() WHERE table_name = ?`, [
    name,
  ])
  return Number(result.getRowObjects()[0]?.c ?? 0) > 0
}

async function seedLegacyRows(): Promise<void> {
  await handle.writer.run(LEGACY_DDL)
  await handle.writer.run(
    `INSERT INTO access_log (ts, visitor_hash, session_id, ip, path, entity_type, entity_id, referer, referer_host,
      country, region, city, latitude, longitude, timezone, language, ua, browser, browser_version, os, os_version,
      device, device_type, is_bot)
    VALUES
      (epoch_ms(1768000000000::BIGINT), 'hash-a', 'sess-1', NULL, '/post/hello', 'post', 42,
        'https://google.com/', 'google.com', 'US', 'California', 'San Francisco', 37.77, -122.41,
        'America/Los_Angeles', 'en-US', 'Mozilla/5.0', 'Chrome', NULL, 'macOS', NULL, 'Macintosh', NULL, FALSE),
      (epoch_ms(1768000060000::BIGINT), 'hash-b', NULL, NULL, '/',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, TRUE)`,
  )
}

beforeEach(async () => {
  await clearAllTables(db)
  if (handle?.closed === false) {
    await closeTestAnalyticsDb(handle)
  }
  handle = await createTestAnalyticsDb()
})

afterAll(async () => {
  if (handle?.closed === false) {
    await closeTestAnalyticsDb(handle)
  }
})

describe('analytics blob migration (legacy access_log → access_events)', () => {
  it('converts rows, drops the legacy table, and writes the flag row', async () => {
    await seedLegacyRows()

    await runAnalyticsBlobMigrationAtBoot(db, handle)

    expect(await tableExists('access_log')).toBe(false)
    const rows = await handle.reader.runAndReadAll(
      `SELECT index1, is_bot, blob1, blob2, blob3, blob5, blob7, blob9, blob12, blob13, blob16,
              double1, double2, epoch_ms(timestamp) AS ms
       FROM access_events ORDER BY blob1`,
    )
    const objects = rows.getRowObjects()
    expect(objects).toHaveLength(2)

    const site = objects[0]!
    expect(site.index1).toBe('')
    expect(site.is_bot).toBe(true)
    expect(site.blob1).toBe('/')
    expect(site.blob3).toBe('')
    expect(site.blob5).toBe('hash-b')
    expect(site.double1).toBeNull()
    expect(Number(site.ms)).toBe(1768000060000)

    const post = objects[1]!
    expect(post.index1).toBe('post:42')
    expect(post.is_bot).toBe(false)
    expect(post.blob2).toBe('https://google.com/')
    expect(post.blob3).toBe('google.com')
    expect(post.blob5).toBe('hash-a')
    expect(post.blob7).toBe('US')
    expect(post.blob9).toBe('San Francisco')
    expect(post.blob12).toBe('Chrome')
    expect(post.blob13).toBe('')
    expect(post.blob16).toBe('')
    expect(post.double1).toBe(37.77)
    expect(post.double2).toBe(-122.41)
    expect(Number(post.ms)).toBe(1768000000000)

    const flag = findSettingByScope(db, 'system.analytics-blob-migration')
    expect(flag).not.toBeNull()
    expect((flag!.data as { migratedRows: number }).migratedRows).toBe(2)
  })

  it('keeps live events written between a failed run and its retry', async () => {
    await seedLegacyRows()

    await handle.writer.run('DROP TABLE access_events')
    await runAnalyticsBlobMigrationAtBoot(db, handle)
    expect(await tableExists('access_log')).toBe(true)
    expect(findSettingByScope(db, 'system.analytics-blob-migration')).toBeNull()

    await handle.writer.run(ACCESS_EVENTS_DDL)
    await handle.writer.run(
      `INSERT INTO access_events (event_id, index1, timestamp, is_bot, blob1, blob5)
       VALUES (uuid(), '', to_timestamp(1768000200), FALSE, '/live', 'live-visitor')`,
    )

    await runAnalyticsBlobMigrationAtBoot(db, handle)

    expect(await tableExists('access_log')).toBe(false)
    const rows = await handle.reader.runAndReadAll('SELECT blob1 AS path FROM access_events ORDER BY blob1')
    expect(rows.getRowObjects().map((row) => row.path)).toEqual(['/', '/live', '/post/hello'])
    expect(findSettingByScope(db, 'system.analytics-blob-migration')).not.toBeNull()
  })

  it('migrates even when the flag row already exists (analytics-only restore of a pre-rewrite backup)', async () => {
    await seedLegacyRows()
    upsertSetting(
      db,
      { completedAt: new Date().toISOString(), migratedRows: 0 },
      null,
      'system.analytics-blob-migration',
    )

    await runAnalyticsBlobMigrationAtBoot(db, handle)

    expect(await tableExists('access_log')).toBe(false)
    const rows = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_events')
    expect(Number(rows.getRowObjects()[0]?.c)).toBe(2)
    const flag = findSettingByScope(db, 'system.analytics-blob-migration')
    expect((flag!.data as { migratedRows: number }).migratedRows).toBe(2)
  })

  it('is a no-op on the second run (flag-gated)', async () => {
    await seedLegacyRows()
    await runAnalyticsBlobMigrationAtBoot(db, handle)

    await handle.writer.run(
      `INSERT INTO access_events (event_id, index1, timestamp, is_bot, blob1)
       VALUES (uuid(), '', to_timestamp(1768000100), FALSE, '/after')`,
    )
    await runAnalyticsBlobMigrationAtBoot(db, handle)

    const rows = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_events')
    expect(Number(rows.getRowObjects()[0]?.c)).toBe(3)
  })

  it('writes the flag without touching anything when no legacy table exists', async () => {
    await runAnalyticsBlobMigrationAtBoot(db, handle)

    expect(await tableExists('access_events')).toBe(true)
    const rows = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_events')
    expect(Number(rows.getRowObjects()[0]?.c)).toBe(0)
    expect(findSettingByScope(db, 'system.analytics-blob-migration')).not.toBeNull()
  })

  it('skips in-memory sidecars gracefully (no flag written)', async () => {
    const memory = await openAnalyticsDatabase(':memory:', 'CREATE TABLE IF NOT EXISTS access_events (event_id UUID)')
    try {
      expect(memory.inMemory).toBe(true)
      await runAnalyticsBlobMigrationAtBoot(db, memory)
      expect(findSettingByScope(db, 'system.analytics-blob-migration')).toBeNull()
    } finally {
      await memory.writer.run('CHECKPOINT').catch(() => {})
      memory.writer.closeSync()
      memory.reader.closeSync()
      memory.instance.closeSync()
    }
  })
})
