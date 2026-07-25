import { Writable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const poolMock = {
  connect: vi.fn(),
}

vi.mock('@/server/infra/db/copy-batcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/db/copy-batcher')>()
  return {
    ...actual,
    CopyBatcher: actual.CopyBatcher,
  }
})

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

import {
  csvRow,
  flushAccessLog,
  pushAccessEvent,
  replayDeadLetterAccessLog,
} from '@/server/domains/analytics/repos/batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'

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
    entityId: 1n,
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

function mockPoolForCopy() {
  const writable = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  const client = {
    query: vi.fn(() => writable),
    release: vi.fn(),
  }
  poolMock.connect.mockResolvedValue(client)
}

describe('analytics batcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAllBatchers()
  })

  it('serializes an event to csv', () => {
    const row = csvRow(makeEvent({ entityId: 42n, latitude: 1.5, longitude: 2.5, isBot: true }))
    expect(row).toContain('42')
    expect(row).toContain('1.5')
    expect(row).toContain('2.5')
    expect(row).toContain('t')
    expect(row.endsWith('\n')).toBe(true)
  })

  it('flushes an empty batch immediately', async () => {
    initAllBatchers(poolMock as never, {} as never)
    const result = await flushAccessLog()
    expect(result).toEqual({ committed: 0, deadLettered: 0 })
  })

  it('pushes and flushes events', async () => {
    mockPoolForCopy()
    initAllBatchers(poolMock as never, {} as never)
    pushAccessEvent(makeEvent())
    const result = await flushAccessLog()
    expect(result.committed).toBe(1)
    expect(result.deadLettered).toBe(0)
  })

  it('throws when pushing before initialization', () => {
    resetAllBatchers()
    expect(() => pushAccessEvent(makeEvent())).toThrow('not initialized')
  })

  it('dead-letters events when COPY fails', async () => {
    const client = {
      query: vi.fn(() => {
        const stream = new Writable({
          write(_chunk, _encoding, callback) {
            callback(new Error('copy failed'))
          },
        })
        return stream
      }),
      release: vi.fn(),
    }
    poolMock.connect.mockResolvedValue(client)
    initAllBatchers(poolMock as never, {} as never)
    pushAccessEvent(makeEvent())
    const result = await flushAccessLog()
    expect(result.deadLettered).toBe(1)
  })

  it('replays dead-letter events', async () => {
    mockPoolForCopy()
    initAllBatchers(poolMock as never, {} as never)
    const result = await replayDeadLetterAccessLog('/nonexistent')
    expect(result.replayed).toBe(0)
  })
})
