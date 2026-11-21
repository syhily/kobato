import type { DuckDBLogger } from '@kobato/db/duckdb/database'

import { DuckDBInstance } from '@duckdb/node-api'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@kobato/db/duckdb/database'
import { ANALYTICS_DDL } from '@kobato/db/duckdb/schema'
import { mkdtempSync, rmSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

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

interface CapturedLog {
  level: 'info' | 'warn' | 'error'
  msg: string
  ctx?: Record<string, unknown>
}

function captureLogger(): DuckDBLogger & { lines: CapturedLog[] } {
  const lines: CapturedLog[] = []
  return {
    lines,
    info: (msg, ctx) => lines.push({ level: 'info', msg, ctx }),
    warn: (msg, ctx) => lines.push({ level: 'warn', msg, ctx }),
    error: (msg, ctx) => lines.push({ level: 'error', msg, ctx }),
  }
}

const dirs: string[] = []

afterEach(() => {
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

  it('upgrades a 1.x-format file to 2.0 on open, preserving rows, and logs through the injected logger', async () => {
    const analyticsPath = join(makeDir(), 'analytics.duckdb')
    const log = captureLogger()

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

    const handle = await openAnalyticsDatabase(analyticsPath, ANALYTICS_DDL, log)

    expect(await readStorageVersion(analyticsPath)).toBe(999n)
    const rows = await handle.reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(rows.getRowObjects()).toEqual([{ path: '/old-format' }])
    expect(log.lines).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'Analytics sidecar upgraded to the DuckDB 2.0 storage format',
        ctx: expect.objectContaining({ path: analyticsPath }),
      }),
    )

    await closeAnalyticsDatabase(handle)
  })

  it('reopens an upgraded file without re-converting or losing rows', async () => {
    const analyticsPath = join(makeDir(), 'analytics.duckdb')
    const log = captureLogger()
    const first = await openAnalyticsDatabase(analyticsPath, ANALYTICS_DDL)
    await first.writer.run(
      `INSERT INTO access_events (event_id, timestamp, is_bot, blob1) VALUES (uuid(), to_timestamp(?), false, '/kept')`,
      [Math.floor(Date.now() / 1000)],
    )
    await closeAnalyticsDatabase(first)

    const second = await openAnalyticsDatabase(analyticsPath, ANALYTICS_DDL, log)

    expect(await readStorageVersion(analyticsPath)).toBe(999n)
    const rows = await second.reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(rows.getRowObjects()).toEqual([{ path: '/kept' }])
    expect(log.lines).not.toContainEqual(
      expect.objectContaining({ msg: 'Analytics sidecar upgraded to the DuckDB 2.0 storage format' }),
    )

    await closeAnalyticsDatabase(second)
  })
})
