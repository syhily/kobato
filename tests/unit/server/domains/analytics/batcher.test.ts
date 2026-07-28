import { readFile, rename, writeFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { closeTestAnalyticsDb, createTestAnalyticsDb } from '#/_helpers/analytics-db'
import { replayDeadLetterAccessLog } from '@/server/domains/analytics/services/batcher'
import { initAllBatchers } from '@/server/infra/db/batcher-registry'

// Mock fs/promises so dead-letter file contents are controlled without
// touching the real filesystem. The analytics handle is a REAL DuckDB
// sidecar — replay appends through the same Appender protocol as
// production — with a failure gate on `createAppender` so the
// ingest-failure cases stay deterministic.
let analyticsHandle: AnalyticsHandle
let ingestShouldFail = false

vi.mock('@/server/bootstrap/analytics-lifecycle', () => ({
  getAnalyticsHandle: () => ({
    ...analyticsHandle,
    writer: {
      createAppender: async (table: string) => {
        if (ingestShouldFail) throw new Error('ingest down')
        return analyticsHandle.writer.createAppender(table)
      },
    },
  }),
}))

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

const makeEvent = (path: string) =>
  JSON.stringify({
    ts: Date.now(),
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

beforeAll(async () => {
  analyticsHandle = await createTestAnalyticsDb()
})

afterAll(async () => {
  await closeTestAnalyticsDb(analyticsHandle)
})

beforeEach(() => {
  ingestShouldFail = false
})

describe('replayDeadLetter', () => {
  // The batcher must be initialized (via the shared registry) before
  // replay operations. The db stub is inert — AccessLogBatcher writes
  // through the analytics handle, not the relational db.
  const dbStub = {}
  initAllBatchers({ db: dbStub, client: {}, path: ':memory:', closed: false } as never)

  it('returns replayed=0 failed=0 when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await replayDeadLetterAccessLog('/tmp/nonexistent.jsonl')
    expect(result).toEqual({ replayed: 0, failed: 0 })
  })

  it('replays all valid events when copy succeeds', async () => {
    const lines = [makeEvent('/a'), makeEvent('/b'), makeEvent('/c')]
    vi.mocked(readFile).mockResolvedValue(lines.join('\n') + '\n')
    vi.mocked(writeFile).mockResolvedValue(undefined)
    vi.mocked(rename).mockResolvedValue(undefined)

    const result = await replayDeadLetterAccessLog('/tmp/test.jsonl')
    expect(result.replayed).toBe(3)
    expect(result.failed).toBe(0)
  })

  it('counts parse failures in failed, replayed=0 when ingest fails', async () => {
    ingestShouldFail = true
    const lines = [makeEvent('/a'), 'this-is-not-json', makeEvent('/c')]
    vi.mocked(readFile).mockResolvedValue(lines.join('\n') + '\n')

    const result = await replayDeadLetterAccessLog('/tmp/test.jsonl')
    expect(result.replayed).toBe(0)
    expect(result.failed).toBe(3) // 1 parse + 2 copy failures
  })

  it('counts mixed parse and ingest failures correctly', async () => {
    ingestShouldFail = true
    const lines = [makeEvent('/a'), 'bad-1', 'bad-2', makeEvent('/d')]
    vi.mocked(readFile).mockResolvedValue(lines.join('\n') + '\n')

    const result = await replayDeadLetterAccessLog('/tmp/test.jsonl')
    expect(result.replayed).toBe(0)
    expect(result.failed).toBe(4) // 2 parse + 2 copy failures
  })
})
