import type { AnalyticsHandle, DuckDBLogger } from '@kobato/db/duckdb/database.ts'

import { runAccessLogRetention } from '@kobato/db/duckdb/maintenance.ts'
import {
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
  seedDeviceEnvClientRows,
  seedDeviceEnvServerRows,
} from '@kobato/test/analytics-db.ts'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

// The DuckDB half of the daily DB maintenance job against a real sidecar:
// the 180-day retention DELETE + CHECKPOINT over all three tables at one
// cutoff. The SQLite half stays in the server package's maintenance test.

interface CapturedLog {
  level: 'info' | 'warn' | 'error'
  msg: string
  ctx?: Record<string, unknown>
}

/** Capture logger standing in for the composition layer's injected logger. */
function captureLogger(): DuckDBLogger & { lines: CapturedLog[] } {
  const lines: CapturedLog[] = []
  return {
    lines,
    info: (msg, ctx) => lines.push({ level: 'info', msg, ctx }),
    warn: (msg, ctx) => lines.push({ level: 'warn', msg, ctx }),
    error: (msg, ctx) => lines.push({ level: 'error', msg, ctx }),
  }
}

describe('db maintenance — DuckDB retention + checkpoint (plan §1.11)', () => {
  let analyticsHandle: AnalyticsHandle
  let log: ReturnType<typeof captureLogger>

  beforeEach(async () => {
    analyticsHandle = await createTestAnalyticsDb()
    log = captureLogger()
  })

  afterAll(async () => {
    // Handles are tracked by the helper and closed wholesale.
  })

  it('deletes rows past the 180-day retention, keeps recent rows, logs counts and file sizes', async () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
    const recent = new Date()
    await seedAccessEvents(analyticsHandle, [
      { ts: old, path: '/old', visitorHash: 'old-visitor' },
      { ts: recent, path: '/recent', visitorHash: 'recent-visitor' },
    ])

    await runAccessLogRetention(analyticsHandle, log)

    const result = await analyticsHandle.reader.runAndReadAll('SELECT blob1 AS path FROM access_events ORDER BY blob1')
    const paths = result.getRowObjects().map((row) => row.path)
    expect(paths).toEqual(['/recent'])
    expect(log.lines).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'analytics maintenance completed',
        ctx: expect.objectContaining({
          retentionDays: 180,
          rowsBefore: 2n,
          rowsAfter: 1n,
          // File-backed handle → real file sizes logged (null on :memory:).
          bytesBefore: expect.any(Number),
          bytesAfter: expect.any(Number),
        }),
      }),
    )

    await closeTestAnalyticsDb(analyticsHandle)
  })

  it('cuts both device-environment sidecars at the same retention boundary', async () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
    const recent = new Date()
    const oldId = '00000000-0000-4000-8000-000000000001'
    const recentId = '00000000-0000-4000-8000-000000000002'

    await seedAccessEvents(analyticsHandle, [
      { ts: old, path: '/old' },
      { ts: recent, path: '/recent' },
    ])
    await seedDeviceEnvServerRows(analyticsHandle, [
      { eventId: oldId, timestamp: old, platform: 'macOS' },
      { eventId: recentId, timestamp: recent, platform: 'macOS' },
    ])
    await seedDeviceEnvClientRows(analyticsHandle, [
      { eventId: oldId, timestamp: old, hasStatic: true },
      { eventId: recentId, timestamp: recent },
    ])

    await runAccessLogRetention(analyticsHandle, log)

    const paths = await analyticsHandle.reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(paths.getRowObjects()).toEqual([{ path: '/recent' }])
    const server = await analyticsHandle.reader.runAndReadAll('SELECT event_id::VARCHAR AS id FROM device_env_server')
    expect(server.getRowObjects()).toEqual([{ id: recentId }])
    const client = await analyticsHandle.reader.runAndReadAll('SELECT event_id::VARCHAR AS id FROM device_env_client')
    expect(client.getRowObjects()).toEqual([{ id: recentId }])

    // The logged totals cover all three tables (2 events + 2 + 2).
    expect(log.lines).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'analytics maintenance completed',
        ctx: expect.objectContaining({ rowsBefore: 6n, rowsAfter: 3n }),
      }),
    )

    await closeTestAnalyticsDb(analyticsHandle)
  })

  it('applies the same absolute cutoff regardless of the session TimeZone', async () => {
    // Pin a non-UTC session zone on BOTH connections: the cutoff binds epoch
    // seconds through to_timestamp(?), so TIMESTAMPTZ compares stay absolute.
    await analyticsHandle.writer.run(`SET TimeZone='America/Los_Angeles'`)
    await analyticsHandle.reader.run(`SET TimeZone='Pacific/Auckland'`)
    const justOld = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000)
    const justNew = new Date(Date.now() - 179 * 24 * 60 * 60 * 1000)
    await seedAccessEvents(analyticsHandle, [
      { ts: justOld, path: '/past-cutoff', visitorHash: 'a' },
      { ts: justNew, path: '/inside-cutoff', visitorHash: 'b' },
    ])

    await runAccessLogRetention(analyticsHandle, log)

    const result = await analyticsHandle.reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(result.getRowObjects().map((row) => row.path)).toEqual(['/inside-cutoff'])

    await closeTestAnalyticsDb(analyticsHandle)
  })
})
