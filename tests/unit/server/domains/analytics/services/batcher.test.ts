import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccessLogItem } from '@/server/domains/analytics/services/batcher'
import type { DeviceEnvServerRow } from '@/server/domains/analytics/services/device-env'
import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'
import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'
import type { DatabaseHandle } from '@/server/infra/db/database'

import { closeTestAnalyticsDb, createTestAnalyticsDb } from '#/_helpers/analytics-db'
import { __adoptAnalyticsHandleForTests, __resetAnalyticsEngineForTests } from '@/server/bootstrap/analytics-lifecycle'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'

let analyticsHandle: AnalyticsHandle

import { flushAccessLog, pushAccessEvent, replayDeadLetterAccessLog } from '@/server/domains/analytics/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'

let handle: DatabaseHandle

function makeEvent(overrides: Partial<EnrichedAccessEvent> = {}): EnrichedAccessEvent {
  return {
    eventId: '00000000-0000-4000-8000-0000000000aa',
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

function makeEnvServer(overrides: Partial<DeviceEnvServerRow> = {}): DeviceEnvServerRow {
  return {
    eventId: '00000000-0000-4000-8000-0000000000aa',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    uaFullVersion: '141.0.7390.55',
    platform: 'macOS',
    platformVersion: '15.1.0',
    model: 'MacBook Pro',
    mobile: false,
    brands: '',
    arch: 'arm',
    bitness: '64',
    formFactors: '"Desktop"',
    acceptLanguage: 'zh-CN,zh;q=0.9',
    ...overrides,
  }
}

function makeItem(
  eventOverrides: Partial<EnrichedAccessEvent> = {},
  envServer: DeviceEnvServerRow | null = makeEnvServer(),
): AccessLogItem {
  return { event: makeEvent(eventOverrides), envServer }
}

describe('analytics batcher (DuckDB appender)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetAllBatchers()
    if (analyticsHandle?.closed === false) {
      await closeTestAnalyticsDb(analyticsHandle)
    }
    handle = getDatabaseHandle()
    analyticsHandle = await createTestAnalyticsDb()
    __resetAnalyticsEngineForTests()
    __adoptAnalyticsHandleForTests(analyticsHandle)
    await analyticsHandle.writer.run('DELETE FROM access_events')
    await analyticsHandle.writer.run('DELETE FROM device_env_server')
    initAllBatchers(handle)
  })

  afterAll(async () => {
    resetAllBatchers()
    __resetAnalyticsEngineForTests()
    await closeTestAnalyticsDb(analyticsHandle)
  })

  it('flushes an empty batch immediately', async () => {
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 0, deadLettered: 0 })
  })

  it('pushes and flushes events into DuckDB access_events', async () => {
    pushAccessEvent(makeItem())
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 1, deadLettered: 0 })

    const rows = await analyticsHandle.reader.runAndReadAll(
      'SELECT event_id::VARCHAR AS eventId, blob1 AS path, index1, is_bot FROM access_events',
    )
    const objects = await rows.getRowObjects()
    expect(objects).toHaveLength(1)
    expect(objects[0]).toEqual({
      eventId: '00000000-0000-4000-8000-0000000000aa',
      path: '/',
      index1: 'post:1',
      is_bot: false,
    })
  })

  it('writes the paired device_env_server row in the same flush', async () => {
    pushAccessEvent(makeItem())
    await flushAccessLog()

    const rows = await analyticsHandle.reader.runAndReadAll(
      'SELECT event_id::VARCHAR AS eventId, platform, arch, accept_language AS acceptLanguage FROM device_env_server',
    )
    expect(rows.getRowObjects()).toEqual([
      {
        eventId: '00000000-0000-4000-8000-0000000000aa',
        platform: 'macOS',
        arch: 'arm',
        acceptLanguage: 'zh-CN,zh;q=0.9',
      },
    ])
  })

  it('skips the sidecar append for a legacy item (envServer null)', async () => {
    pushAccessEvent(makeItem({}, null))
    await flushAccessLog()

    const rows = await analyticsHandle.reader.runAndReadAll('SELECT count(*) AS c FROM device_env_server')
    expect(rows.getRowObjects()[0]?.c).toBe(0n)
  })

  it('throws when pushing before initialization', () => {
    resetAllBatchers()
    expect(() => pushAccessEvent(makeItem())).toThrow('not initialized')
  })

  it('replays dead-letter events (none on disk → no-op)', async () => {
    const result = await replayDeadLetterAccessLog('/nonexistent')
    expect(result.replayed).toBe(0)
  })

  it('replays a legacy flat dead-letter line: mints an event id and skips the sidecar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kobato-dead-letter-'))
    const path = join(dir, 'access-log.ndjson')
    // Pre-ADR-0006 shape: a flat EnrichedAccessEvent with an ISO-string ts.
    writeFileSync(
      path,
      `${JSON.stringify({ ...makeEvent(), eventId: undefined, ts: '2024-01-01T00:00:00.000Z' })}\n`,
      'utf-8',
    )
    try {
      expect(await replayDeadLetterAccessLog(path)).toEqual({ replayed: 1, failed: 0 })
      await flushAccessLog()

      const rows = await analyticsHandle.reader.runAndReadAll(
        'SELECT event_id::VARCHAR AS eventId, blob1 AS path FROM access_events',
      )
      const eventRows = rows.getRowObjects()
      expect(eventRows).toHaveLength(1)
      expect(eventRows[0]!.path).toBe('/')
      expect(eventRows[0]!.eventId).toMatch(/^[0-9a-f-]{36}$/)

      const envRows = await analyticsHandle.reader.runAndReadAll('SELECT count(*) AS c FROM device_env_server')
      expect(envRows.getRowObjects()[0]?.c).toBe(0n)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
