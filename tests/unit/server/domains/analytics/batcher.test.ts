import { PassThrough } from 'node:stream'
import superjson from 'superjson'
import { describe, expect, it, vi } from 'vitest'

import { replayDeadLetterAccessLog } from '@/server/domains/analytics/repos/batcher'
import { initAllBatchers } from '@/server/infra/db/batcher-registry'

const { mockPool } = vi.hoisted(() => {
  const mp: any = {
    connect: vi.fn(async () => ({
      query: vi.fn(() => new PassThrough()),
      release: vi.fn(),
    })),
  }
  return { mockPool: mp }
})

// Mock fs/promises so we can control dead-letter file contents without
// touching the real filesystem.
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    appendFile: vi.fn(),
  }
})

// Mock pg-copy-streams so COPY operations succeed/fail predictably.
vi.mock('pg-copy-streams', () => ({
  from: vi.fn(() => {
    return new PassThrough()
  }),
}))

// Mock the DB pool so copyEvents can acquire a client.
vi.mock('@/server/infra/db/pool', () => ({
  pool: mockPool,
}))

import { readFile, rename, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

// Mock pipeline so copyEvents either succeeds or fails on demand.
vi.mock('node:stream/promises', async () => {
  const actual = await vi.importActual<typeof import('node:stream/promises')>('node:stream/promises')
  return {
    ...actual,
    pipeline: vi.fn(),
  }
})

const makeEvent = (path: string) =>
  superjson.stringify({
    ts: new Date(),
    visitorHash: 'h',
    sessionId: null,
    ip: null,
    path,
    entityType: null,
    entityId: null,
    referer: null,
    refererHost: null,
    country: null,
    region: null,
    city: null,
    latitude: null,
    longitude: null,
    timezone: null,
    language: null,
    ua: null,
    browser: null,
    browserVersion: null,
    os: null,
    osVersion: null,
    device: null,
    deviceType: null,
    isBot: false,
  })

describe('replayDeadLetter', () => {
  // The batcher must be initialized (via the shared registry) before
  // replay operations.
  initAllBatchers(mockPool, {} as never)

  it('returns replayed=0 failed=0 when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await replayDeadLetterAccessLog('/tmp/nonexistent.jsonl')
    expect(result).toEqual({ replayed: 0, failed: 0 })
  })

  it('replays all valid events when copy succeeds', async () => {
    const lines = [makeEvent('/a'), makeEvent('/b'), makeEvent('/c')]
    vi.mocked(readFile).mockResolvedValue(lines.join('\n') + '\n')
    vi.mocked(pipeline).mockResolvedValue(undefined)
    vi.mocked(writeFile).mockResolvedValue(undefined)
    vi.mocked(rename).mockResolvedValue(undefined)

    const result = await replayDeadLetterAccessLog('/tmp/test.jsonl')
    expect(result.replayed).toBe(3)
    expect(result.failed).toBe(0)
  })

  it('counts parse failures in failed, replayed=0 when copy fails', async () => {
    const lines = [makeEvent('/a'), 'this-is-not-json', makeEvent('/c')]
    vi.mocked(readFile).mockResolvedValue(lines.join('\n') + '\n')
    vi.mocked(pipeline).mockRejectedValue(new Error('COPY failed'))

    const result = await replayDeadLetterAccessLog('/tmp/test.jsonl')
    expect(result.replayed).toBe(0)
    expect(result.failed).toBe(3) // 1 parse + 2 copy failures
  })

  it('counts mixed parse and copy failures correctly', async () => {
    const lines = [makeEvent('/a'), 'bad-1', 'bad-2', makeEvent('/d')]
    vi.mocked(readFile).mockResolvedValue(lines.join('\n') + '\n')
    vi.mocked(pipeline).mockRejectedValue(new Error('COPY failed'))

    const result = await replayDeadLetterAccessLog('/tmp/test.jsonl')
    expect(result.replayed).toBe(0)
    expect(result.failed).toBe(4) // 2 parse + 2 copy failures
  })
})
