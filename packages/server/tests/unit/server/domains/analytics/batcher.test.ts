import type { AnalyticsHandle } from '@kobato/db/duckdb/database.ts'

import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle.ts'
import { replayDeadLetterAccessLog } from '@kobato/server/domains/analytics/services/batcher.ts'
import { initAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { closeTestAnalyticsDb, createTestAnalyticsDb } from '@kobato/server/tests/utils/analytics-db.ts'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let analyticsHandle: AnalyticsHandle
let ingestShouldFail = false

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
    browserType: null,
    os: null,
    device: null,
    deviceType: null,
    isBot: false,
  })

beforeAll(async () => {
  analyticsHandle = await createTestAnalyticsDb()
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

beforeEach(() => {
  ingestShouldFail = false
  __resetAnalyticsEngineForTests()
  __adoptAnalyticsHandleForTests({
    ...analyticsHandle,
    writer: {
      createAppender: async (table: string) => {
        if (ingestShouldFail) {
          throw new Error('ingest down')
        }
        return analyticsHandle.writer.createAppender(table)
      },
    } as AnalyticsHandle['writer'],
  })
})

describe('replayDeadLetter', () => {
  const dbStub = {}
  initAllBatchers({ db: dbStub, client: {}, path: ':memory:', inMemory: true, closed: false } as never)

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
    expect(result.failed).toBe(3)
  })

  it('counts mixed parse and ingest failures correctly', async () => {
    ingestShouldFail = true
    const lines = [makeEvent('/a'), 'bad-1', 'bad-2', makeEvent('/d')]
    vi.mocked(readFile).mockResolvedValue(lines.join('\n') + '\n')

    const result = await replayDeadLetterAccessLog('/tmp/test.jsonl')
    expect(result.replayed).toBe(0)
    expect(result.failed).toBe(4)
  })
})
