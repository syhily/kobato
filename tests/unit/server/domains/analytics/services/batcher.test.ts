import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'
import type { DatabaseHandle } from '@/server/infra/db/database'

import { closeTestAnalyticsDb, createTestAnalyticsDb } from '#/_helpers/analytics-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'

vi.mock('@/server/infra/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/logger')>()
  return {
    ...actual,
    getLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(function (this: unknown) {
        return this
      }),
    })),
  }
})

vi.mock('@/server/infra/paths', () => ({
  ANALYTICS_DEAD_LETTER_PATH: '/tmp/dead-letter.log',
}))

let analyticsHandle: AnalyticsHandle

vi.mock('@/server/bootstrap/analytics-lifecycle', () => ({
  getAnalyticsHandle: () => analyticsHandle,
}))

import { flushAccessLog, pushAccessEvent, replayDeadLetterAccessLog } from '@/server/domains/analytics/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'

let handle: DatabaseHandle

function makeEvent(
  overrides: Partial<Parameters<typeof pushAccessEvent>[0]> = {},
): Parameters<typeof pushAccessEvent>[0] {
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

describe('analytics batcher (DuckDB appender)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetAllBatchers()
    if (analyticsHandle?.closed === false) {
      await closeTestAnalyticsDb(analyticsHandle)
    }
    handle = getDatabaseHandle()
    analyticsHandle = await createTestAnalyticsDb()
    await analyticsHandle.writer.run('DELETE FROM access_log')
    initAllBatchers(handle)
  })

  afterAll(async () => {
    resetAllBatchers()
    await closeTestAnalyticsDb(analyticsHandle)
  })

  it('flushes an empty batch immediately', async () => {
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 0, deadLettered: 0 })
  })

  it('pushes and flushes events into DuckDB access_log', async () => {
    pushAccessEvent(makeEvent())
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 1, deadLettered: 0 })

    const rows = await analyticsHandle.reader.runAndReadAll('SELECT path, entity_id, is_bot FROM access_log')
    const objects = await rows.getRowObjects()
    expect(objects).toHaveLength(1)
    expect(objects[0]!.path).toBe('/')
    expect(objects[0]!.entity_id).toBe(1n)
    expect(objects[0]!.is_bot).toBe(false)
  })

  it('throws when pushing before initialization', () => {
    resetAllBatchers()
    expect(() => pushAccessEvent(makeEvent())).toThrow('not initialized')
  })

  it('replays dead-letter events (none on disk → no-op)', async () => {
    const result = await replayDeadLetterAccessLog('/nonexistent')
    expect(result.replayed).toBe(0)
  })
})
