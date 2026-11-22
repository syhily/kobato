import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'
import type { DuckDBLogger } from '@kobato/db/duckdb/database'

import { engineOf } from '@kobato/db/duckdb/connection'
import { runAccessLogRetention } from '@kobato/db/duckdb/maintenance'
import {
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
  seedDeviceEnvClientRows,
  seedDeviceEnvServerRows,
} from '@kobato/db/tests/utils/analytics-db'
import { beforeEach, describe, expect, it } from 'vitest'

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

describe('db maintenance — DuckDB retention + checkpoint (plan §1.11)', () => {
  let analyticsHandle: AnalyticsHandle
  let log: ReturnType<typeof captureLogger>

  beforeEach(async () => {
    analyticsHandle = await createTestAnalyticsDb()
    log = captureLogger()
  })

  it('deletes rows past the 180-day retention, keeps recent rows, logs counts and file sizes', async () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
    const recent = new Date()
    await seedAccessEvents(analyticsHandle, [
      { ts: old, path: '/old', visitorHash: 'old-visitor' },
      { ts: recent, path: '/recent', visitorHash: 'recent-visitor' },
    ])

    await runAccessLogRetention(analyticsHandle, log)

    const result = await engineOf(analyticsHandle).reader.runAndReadAll(
      'SELECT blob1 AS path FROM access_events ORDER BY blob1',
    )
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

    const paths = await engineOf(analyticsHandle).reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(paths.getRowObjects()).toEqual([{ path: '/recent' }])
    const server = await engineOf(analyticsHandle).reader.runAndReadAll(
      'SELECT event_id::VARCHAR AS id FROM device_env_server',
    )
    expect(server.getRowObjects()).toEqual([{ id: recentId }])
    const client = await engineOf(analyticsHandle).reader.runAndReadAll(
      'SELECT event_id::VARCHAR AS id FROM device_env_client',
    )
    expect(client.getRowObjects()).toEqual([{ id: recentId }])

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
    await engineOf(analyticsHandle).writer.run(`SET TimeZone='America/Los_Angeles'`)
    await engineOf(analyticsHandle).reader.run(`SET TimeZone='Pacific/Auckland'`)
    const justOld = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000)
    const justNew = new Date(Date.now() - 179 * 24 * 60 * 60 * 1000)
    await seedAccessEvents(analyticsHandle, [
      { ts: justOld, path: '/past-cutoff', visitorHash: 'a' },
      { ts: justNew, path: '/inside-cutoff', visitorHash: 'b' },
    ])

    await runAccessLogRetention(analyticsHandle, log)

    const result = await engineOf(analyticsHandle).reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(result.getRowObjects().map((row) => row.path)).toEqual(['/inside-cutoff'])

    await closeTestAnalyticsDb(analyticsHandle)
  })
})
