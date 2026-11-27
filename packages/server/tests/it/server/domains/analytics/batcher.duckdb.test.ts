import type { AnalyticsHandle, DuckDbEngine } from '@kobato/db/duckdb/connection'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { engineOf } from '@kobato/db/duckdb/connection'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import { replayDeadLetterAccessLog } from '@kobato/server/domains/analytics/services/batcher'
import { initAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { closeTestAnalyticsDb, createTestAnalyticsDb } from '@kobato/server/tests/utils/analytics-db'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let analyticsHandle: AnalyticsHandle
let ingestShouldFail = false

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

let deadLetterDir: string

beforeAll(async () => {
  analyticsHandle = await createTestAnalyticsDb()
  deadLetterDir = mkdtempSync(join(tmpdir(), 'kobato-dead-letter-'))
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
  rmSync(deadLetterDir, { recursive: true, force: true })
})

beforeEach(() => {
  ingestShouldFail = false
  __resetAnalyticsEngineForTests()
  const realWriter = engineOf(analyticsHandle).writer
  __adoptAnalyticsHandleForTests(
    unsafeCast<AnalyticsHandle>({
      ...analyticsHandle,
      writer: {
        createAppender: async (table: string) => {
          if (ingestShouldFail) {
            throw new Error('ingest down')
          }
          return realWriter.createAppender(table)
        },
      } as DuckDbEngine['writer'],
    }),
  )
})

function stageDeadLetter(lines: string[]): string {
  const path = join(deadLetterDir, `dead-${Math.random().toString(36).slice(2)}.jsonl`)
  writeFileSync(path, `${lines.join('\n')}\n`)
  return path
}

describe('replayDeadLetter', () => {
  const dbStub = {}
  initAllBatchers({ db: dbStub, client: {}, path: ':memory:', inMemory: true, closed: false } as never)

  it('returns replayed=0 failed=0 when file does not exist', async () => {
    const result = await replayDeadLetterAccessLog(join(deadLetterDir, 'nonexistent.jsonl'))
    expect(result).toEqual({ replayed: 0, failed: 0 })
  })

  it('replays all valid events for real and truncates the file', async () => {
    const path = stageDeadLetter([makeEvent('/a'), makeEvent('/b'), makeEvent('/c')])

    const result = await replayDeadLetterAccessLog(path)
    expect(result.replayed).toBe(3)
    expect(result.failed).toBe(0)
    expect(readFileSync(path, 'utf8')).toBe('')
  })

  it('counts parse failures in failed, replayed=0 when ingest fails', async () => {
    ingestShouldFail = true
    const path = stageDeadLetter([makeEvent('/a'), 'this-is-not-json', makeEvent('/c')])

    const result = await replayDeadLetterAccessLog(path)
    expect(result.replayed).toBe(0)
    expect(result.failed).toBe(3)
  })

  it('counts mixed parse and ingest failures correctly', async () => {
    ingestShouldFail = true
    const path = stageDeadLetter([makeEvent('/a'), 'bad-1', 'bad-2', makeEvent('/d')])

    const result = await replayDeadLetterAccessLog(path)
    expect(result.replayed).toBe(0)
    expect(result.failed).toBe(4)
  })
})
