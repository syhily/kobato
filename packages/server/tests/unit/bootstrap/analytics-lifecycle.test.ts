import type { EnrichedAccessEvent } from '@kobato/server/domains/analytics/types'
import type { AnalyticsHandle } from '@kobato/server/infra/analytics/duckdb'

import { closeTestAnalyticsDb, createTestAnalyticsDb } from '#/_helpers/analytics-db'

import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
  runAnalyticsMaintenance,
  snapshotAnalyticsTo,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { ACCESS_LOG_DDL } from '@kobato/server/domains/analytics/services/access-log'
import { flushAccessLog, pushAccessEvent } from '@kobato/server/domains/analytics/services/batcher'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@kobato/server/infra/analytics/duckdb'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

// snapshotAnalyticsTo against a REAL temp-file DuckDB sidecar (adopted
// into the lifecycle engine) and the REAL AccessLogBatcher: the pause →
// CHECKPOINT → copyFile → resume window runs for real, only the staging
// directory is test-owned.

let analyticsHandle: AnalyticsHandle
let stagingDir: string

function makeEvent(overrides: Partial<EnrichedAccessEvent> = {}): EnrichedAccessEvent {
  return {
    ts: new Date('2024-01-01T00:00:00Z'),
    visitorHash: 'v',
    sessionId: 's',
    ip: '127.0.0.1',
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
    browserVersion: '',
    os: '',
    osVersion: '',
    device: '',
    deviceType: '',
    isBot: false,
    ...overrides,
  }
}

async function accessLogPaths(handle: AnalyticsHandle): Promise<unknown[]> {
  const rows = await handle.reader.runAndReadAll('SELECT path FROM access_log ORDER BY path')
  const objects = await rows.getRowObjects()
  return objects.map((row) => row.path)
}

beforeEach(async () => {
  resetAllBatchers()
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
  resetAllBatchers()
  __resetAnalyticsEngineForTests()
  if (analyticsHandle?.closed === false) {
    await closeTestAnalyticsDb(analyticsHandle)
  }
  rmSync(stagingDir, { recursive: true, force: true })
})

describe('snapshotAnalyticsTo', () => {
  it('archives a consistent copy: the staged file opens and carries every pre-snapshot row', async () => {
    pushAccessEvent(makeEvent({ path: '/a' }))
    pushAccessEvent(makeEvent({ path: '/b' }))
    await flushAccessLog()

    const stagingPath = join(stagingDir, 'analytics.duckdb')
    expect(await snapshotAnalyticsTo(stagingPath)).toBe(true)

    const copy = await openAnalyticsDatabase(stagingPath, ACCESS_LOG_DDL)
    try {
      expect(await accessLogPaths(copy)).toEqual(['/a', '/b'])
    } finally {
      await closeAnalyticsDatabase(copy)
    }
  })

  it('loses no appends across the window: an event pushed during CHECKPOINT lands after resume', async () => {
    // Interleave an append INTO the pause window deterministically: the
    // decorated writer pushes the event when the snapshot issues its
    // CHECKPOINT — i.e. after the batcher drained and paused.
    const realWriter = analyticsHandle.writer
    const decorated = Object.create(realWriter) as AnalyticsHandle['writer']
    decorated.run = async (sql: string) => {
      if (sql === 'CHECKPOINT') {
        pushAccessEvent(makeEvent({ path: '/during' }))
      }
      return realWriter.run(sql)
    }
    __resetAnalyticsEngineForTests()
    __adoptAnalyticsHandleForTests({ ...analyticsHandle, writer: decorated })

    pushAccessEvent(makeEvent({ path: '/before' }))
    expect(await snapshotAnalyticsTo(join(stagingDir, 'analytics.duckdb'))).toBe(true)

    // resume() fired an immediate flush — join it through the singleflight.
    await flushAccessLog()
    expect(await accessLogPaths(analyticsHandle)).toEqual(['/before', '/during'])
  })

  it('resumes the batcher even when the copy fails', async () => {
    // copyFile into a nonexistent directory rejects — the finally must
    // still release the pause, or every later append would silently
    // buffer forever.
    const stagingPath = join(stagingDir, 'missing-dir', 'analytics.duckdb')
    await expect(snapshotAnalyticsTo(stagingPath)).rejects.toThrow()

    pushAccessEvent(makeEvent({ path: '/after-failure' }))
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 1, deadLettered: 0 })
    expect(await accessLogPaths(analyticsHandle)).toEqual(['/after-failure'])
  })

  it('holds the retention DELETE out of a concurrent snapshot window (mutation lock)', async () => {
    // One row older than the retention window (the maintenance job would
    // delete it) and one fresh row (it must survive — makeEvent's default
    // ts is 2024, which is ALSO past the window, so stamp it explicitly).
    pushAccessEvent(makeEvent({ path: '/old', ts: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }))
    pushAccessEvent(makeEvent({ path: '/new', ts: new Date() }))
    await flushAccessLog()

    // Park the snapshot INSIDE its mutation-lock window: the decorated
    // writer blocks the backup's CHECKPOINT until the test releases it.
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
    // Prototype delegation alone is not enough for the DuckDB connection
    // (private-field receivers) — the retention job's own calls must be
    // forwarded with the real receiver too.
    decorated.runAndReadAll = (sql: string, params?: never) => realWriter.runAndReadAll(sql, params)
    // Record every statement the maintenance job manages to issue through
    // the engine's READER while the snapshot holds the lock (the test's
    // own reads go through the undecorated handle, so only production
    // code paths land here). This turns the negative assertion below into
    // a deterministic pin: while the lock works, the job is parked at
    // `await previous` and can issue NOTHING; if the lock were broken,
    // its path from the (resolved) lock promise to its first statement is
    // pure microtasks, drained by a single event-loop turn — no real-time
    // wait can race it.
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
    await entered // the snapshot now holds the mutation lock

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
