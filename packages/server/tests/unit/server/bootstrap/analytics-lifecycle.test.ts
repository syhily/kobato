import type { EnrichedAccessEvent } from '@kobato/db/duckdb/access-events'
import type { AnalyticsHandle } from '@kobato/db/duckdb/database'

import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@kobato/db/duckdb/database'
import { ANALYTICS_DDL } from '@kobato/db/duckdb/schema'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
  runAnalyticsMaintenance,
  snapshotAnalyticsTo,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAccessLog, pushAccessEvent } from '@kobato/server/domains/analytics/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { closeTestAnalyticsDb, createTestAnalyticsDb } from '@kobato/server/tests/utils/analytics-db'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

let analyticsHandle: AnalyticsHandle
let stagingDir: string

function makeEvent(overrides: Partial<EnrichedAccessEvent> = {}): EnrichedAccessEvent {
  return {
    eventId: randomUUID(),
    ts: new Date('2024-01-01T00:00:00Z'),
    visitorHash: 'v',
    path: '/',
    entityType: 'post',
    entityId: 1,
    referer: '',
    refererHost: '',
    country: '',
    region: '',
    city: '',
    latitude: null,
    longitude: null,
    timezone: '',
    language: '',
    ua: '',
    browser: '',
    browserType: '',
    os: '',
    device: '',
    deviceType: '',
    isBot: false,
    ...overrides,
  }
}

async function accessLogPaths(handle: AnalyticsHandle): Promise<unknown[]> {
  const rows = await handle.reader.runAndReadAll('SELECT blob1 AS path FROM access_events ORDER BY blob1')
  const objects = await rows.getRowObjects()
  return objects.map((row) => row.path)
}

beforeEach(async () => {
  await resetAllBatchers()
  if (analyticsHandle?.closed === false) {
    await closeTestAnalyticsDb(analyticsHandle)
  }
  analyticsHandle = await createTestAnalyticsDb()
  __resetAnalyticsEngineForTests()
  __adoptAnalyticsHandleForTests(analyticsHandle)
  initAllBatchers(getDatabaseHandle())
  stagingDir = mkdtempSync(join(tmpdir(), 'kobato-snapshot-'))
})

afterAll(async () => {
  await resetAllBatchers()
  __resetAnalyticsEngineForTests()
  if (analyticsHandle?.closed === false) {
    await closeTestAnalyticsDb(analyticsHandle)
  }
  rmSync(stagingDir, { recursive: true, force: true })
})

describe('snapshotAnalyticsTo', () => {
  it('archives a consistent copy: the staged file opens and carries every pre-snapshot row', async () => {
    pushAccessEvent({ event: makeEvent({ path: '/a' }), envServer: null })
    pushAccessEvent({ event: makeEvent({ path: '/b' }), envServer: null })
    await flushAccessLog()

    const stagingPath = join(stagingDir, 'analytics.duckdb')
    expect(await snapshotAnalyticsTo(stagingPath)).toBe(true)

    const copy = await openAnalyticsDatabase(stagingPath, ANALYTICS_DDL)
    try {
      expect(await accessLogPaths(copy)).toEqual(['/a', '/b'])
    } finally {
      await closeAnalyticsDatabase(copy)
    }
  })

  it('loses no appends across the window: an event pushed during CHECKPOINT lands after resume', async () => {
    const realWriter = analyticsHandle.writer
    const decorated = Object.create(realWriter) as AnalyticsHandle['writer']
    decorated.run = async (sql: string) => {
      if (sql === 'CHECKPOINT') {
        pushAccessEvent({ event: makeEvent({ path: '/during' }), envServer: null })
      }
      return realWriter.run(sql)
    }
    __resetAnalyticsEngineForTests()
    __adoptAnalyticsHandleForTests({ ...analyticsHandle, writer: decorated })

    pushAccessEvent({ event: makeEvent({ path: '/before' }), envServer: null })
    expect(await snapshotAnalyticsTo(join(stagingDir, 'analytics.duckdb'))).toBe(true)

    await flushAccessLog()
    expect(await accessLogPaths(analyticsHandle)).toEqual(['/before', '/during'])
  })

  it('resumes the batcher even when the copy fails', async () => {
    const stagingPath = join(stagingDir, 'missing-dir', 'analytics.duckdb')
    await expect(snapshotAnalyticsTo(stagingPath)).rejects.toThrow()

    pushAccessEvent({ event: makeEvent({ path: '/after-failure' }), envServer: null })
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 1, deadLettered: 0 })
    expect(await accessLogPaths(analyticsHandle)).toEqual(['/after-failure'])
  })

  it('holds the retention DELETE out of a concurrent snapshot window (mutation lock)', async () => {
    pushAccessEvent({
      event: makeEvent({ path: '/old', ts: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }),
      envServer: null,
    })
    pushAccessEvent({ event: makeEvent({ path: '/new', ts: new Date() }), envServer: null })
    await flushAccessLog()

    const realWriter = analyticsHandle.writer
    const decorated = Object.create(realWriter) as AnalyticsHandle['writer']
    let checkpointEntered!: () => void
    const entered = new Promise<void>((resolve) => {
      checkpointEntered = resolve
    })
    let releaseCheckpoint!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseCheckpoint = resolve
    })
    decorated.run = async (sql: string) => {
      if (sql === 'CHECKPOINT') {
        checkpointEntered()
        await gate
      }
      return realWriter.run(sql)
    }
    decorated.runAndReadAll = (sql: string, params?: never) => realWriter.runAndReadAll(sql, params)
    const realReader = analyticsHandle.reader
    const decoratedReader = Object.create(realReader) as AnalyticsHandle['reader']
    const maintenanceStatements: string[] = []
    decoratedReader.runAndReadAll = (sql: string, params?: never) => {
      maintenanceStatements.push(sql)
      return realReader.runAndReadAll(sql, params)
    }
    __resetAnalyticsEngineForTests()
    __adoptAnalyticsHandleForTests({ ...analyticsHandle, writer: decorated, reader: decoratedReader })

    const snapshot = snapshotAnalyticsTo(join(stagingDir, 'analytics.duckdb'))
    await entered

    let maintenanceDone = false
    const maintenance = runAnalyticsMaintenance().then(() => {
      maintenanceDone = true
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(maintenanceDone).toBe(false)
    expect(maintenanceStatements).toEqual([])
    expect(await accessLogPaths(analyticsHandle)).toContain('/old')

    releaseCheckpoint()
    await snapshot
    await maintenance
    expect(await accessLogPaths(analyticsHandle)).toEqual(['/new'])
  })
})
