import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseHandle } from '@/server/infra/db/database'

import { closeTestDatabase, createTestDatabase } from '#/_helpers/integration-db'

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(function (this: unknown) {
      return this
    }),
  })),
}))

vi.mock('@/server/infra/paths', () => ({
  ANALYTICS_DEAD_LETTER_PATH: '/tmp/dead-letter.log',
}))

import { flushAccessLog, pushAccessEvent, replayDeadLetterAccessLog } from '@/server/domains/analytics/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { accessLog } from '@/server/infra/db/schema/config'

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

describe('analytics batcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAllBatchers()
    handle?.closed === false && closeTestDatabase(handle)
    handle = createTestDatabase()
    handle.db.delete(accessLog).run()
    initAllBatchers(handle)
  })

  afterAll(() => {
    resetAllBatchers()
    closeTestDatabase(handle)
  })

  it('flushes an empty batch immediately', async () => {
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 0, deadLettered: 0 })
  })

  it('pushes and flushes events into access_log', async () => {
    pushAccessEvent(makeEvent())
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 1, deadLettered: 0 })

    const rows = handle.db.select().from(accessLog).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.path).toBe('/')
    expect(rows[0]!.entityId).toBe(1)
    expect(rows[0]!.isBot).toBe(false)
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
