import { DuckDBInstance } from '@duckdb/node-api'
import { mkdtempSync, rmSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { ANALYTICS_DDL } from '@/server/domains/analytics/services/schema'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@/server/infra/analytics/duckdb'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

/** Mirror of the MainHeader layout the module reads: checksum(8), "DUCK"(4), version(uint64 LE). */
async function readStorageVersion(filePath: string): Promise<bigint> {
  const handle = await open(filePath, 'r')
  try {
    const header = Buffer.alloc(20)
    await handle.read(header, 0, 20, 0)
    expect(header.toString('latin1', 8, 12)).toBe('DUCK')
    return header.readBigUInt64LE(12)
  } finally {
    await handle.close()
  }
}

const dirs: string[] = []

afterEach(() => {
  __clearLogCaptureForTests()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-duckdb-storage-'))
  dirs.push(dir)
  return dir
}

describe('analytics sidecar storage format', () => {
  it('stamps the DuckDB 2.0 storage version (999) on a fresh file', async () => {
    const analyticsPath = join(makeDir(), 'analytics.duckdb')
    const handle = await openAnalyticsDatabase(analyticsPath, ANALYTICS_DDL)

    expect(await readStorageVersion(analyticsPath)).toBe(999n)

    await closeAnalyticsDatabase(handle)
  })

  it('upgrades a 1.x-format file to 2.0 on open, preserving rows', async () => {
    const analyticsPath = join(makeDir(), 'analytics.duckdb')

    // Build a v68 file the way DuckDB 1.5.x wrote it.
    const legacy = await DuckDBInstance.create(analyticsPath, { storage_compatibility_version: 'v1.5.6' })
    const legacyWriter = await legacy.connect()
    for (const ddl of ANALYTICS_DDL) {
      await legacyWriter.run(ddl)
    }
    await legacyWriter.run(
      `INSERT INTO access_events (event_id, timestamp, is_bot, blob1) VALUES (uuid(), to_timestamp(?), false, '/old-format')`,
      [Math.floor(Date.now() / 1000)],
    )
    await legacyWriter.run('CHECKPOINT')
    legacyWriter.closeSync()
    legacy.closeSync()
    expect(await readStorageVersion(analyticsPath)).toBe(68n)

    const handle = await openAnalyticsDatabase(analyticsPath, ANALYTICS_DDL)

    expect(await readStorageVersion(analyticsPath)).toBe(999n)
    const rows = await handle.reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(rows.getRowObjects()).toEqual([{ path: '/old-format' }])
    expect(__logCaptureForTests()).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'Analytics sidecar upgraded to the DuckDB 2.0 storage format',
      }),
    )

    await closeAnalyticsDatabase(handle)
  })

  it('reopens an upgraded file without re-converting or losing rows', async () => {
    const analyticsPath = join(makeDir(), 'analytics.duckdb')
    const first = await openAnalyticsDatabase(analyticsPath, ANALYTICS_DDL)
    await first.writer.run(
      `INSERT INTO access_events (event_id, timestamp, is_bot, blob1) VALUES (uuid(), to_timestamp(?), false, '/kept')`,
      [Math.floor(Date.now() / 1000)],
    )
    await closeAnalyticsDatabase(first)

    const second = await openAnalyticsDatabase(analyticsPath, ANALYTICS_DDL)

    expect(await readStorageVersion(analyticsPath)).toBe(999n)
    const rows = await second.reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(rows.getRowObjects()).toEqual([{ path: '/kept' }])
    expect(__logCaptureForTests()).not.toContainEqual(
      expect.objectContaining({ msg: 'Analytics sidecar upgraded to the DuckDB 2.0 storage format' }),
    )

    await closeAnalyticsDatabase(second)
  })
})
