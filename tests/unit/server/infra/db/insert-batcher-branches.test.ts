import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: vi.fn(),
  unregisterShutdownHook: vi.fn(),
}))

import { InsertBatcher, type FlushResult, replayDeadLetter, writeDeadLetter } from '@/server/infra/db/insert-batcher'

const tmp = mkdtempSync(join(tmpdir(), 'insert-batcher-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function fakeDb(): Database {
  return {} as Database
}

class TestBatcher extends InsertBatcher<string> {
  static inserted: string[][] = []
  static failNext = false

  protected insertBatch(_db: Database, events: string[]): void {
    if (TestBatcher.failNext) {
      TestBatcher.failNext = false
      throw new Error('insert failed')
    }
    TestBatcher.inserted.push(events)
  }

  protected async onInsertFailed(events: string[]): Promise<FlushResult> {
    await writeDeadLetter(events, (es) => es.join('\n') + '\n', join(tmp, 'dead-letter.jsonl'), {
      info: vi.fn(),
      error: vi.fn(),
    } as never)
    return { committed: 0, deadLettered: events.length }
  }
}

describe('server/infra/db/insert-batcher — flush mechanics', () => {
  it('flushes the whole buffer as one batch at the threshold', async () => {
    TestBatcher.inserted = []
    const batcher = new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 3 }, 'test', () => fakeDb())
    batcher.push('a')
    batcher.push('b')
    batcher.push('c')
    const result = await batcher.flush()
    expect(result).toEqual({ committed: 3, deadLettered: 0 })
    expect(TestBatcher.inserted).toEqual([['a', 'b', 'c']])
  })

  it('dispose disarms the flush timer and drops the pending batch', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      const batcher = new TestBatcher({ flushIntervalMs: 1_000, flushThreshold: 100 }, 'test', () => fakeDb())
      batcher.push('a')
      batcher.push('b')

      batcher.dispose()

      // The orphaned-timer hazard: a disposed batcher must never flush
      // its stale batch into a post-reset database.
      await vi.advanceTimersByTimeAsync(60_000)
      expect(TestBatcher.inserted).toEqual([])
      const result = await batcher.flush()
      expect(result).toEqual({ committed: 0, deadLettered: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('routes a failed batch to onInsertFailed (dead-letter) and clears the buffer', async () => {
    TestBatcher.inserted = []
    const batcher = new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 2 }, 'test', () => fakeDb())
    batcher.push('x')
    TestBatcher.failNext = true
    batcher.push('y')
    const result = await batcher.flush()
    expect(result).toEqual({ committed: 0, deadLettered: 2 })
    expect(TestBatcher.inserted).toEqual([])
    expect(readFileSync(join(tmp, 'dead-letter.jsonl'), 'utf-8')).toContain('x\ny')
  })

  it('replays a dead-letter file back through ingest and truncates it', async () => {
    writeFileSync(join(tmp, 'replay.jsonl'), 'r1\nr2\n')
    const batcher = new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 10 }, 'test', () => fakeDb())
    TestBatcher.inserted = []
    const log = { info: vi.fn(), error: vi.fn() } as never
    const result = await replayDeadLetter(
      join(tmp, 'replay.jsonl'),
      (line) => line,
      (events) => batcher.ingest(events),
      log,
    )
    expect(result).toEqual({ replayed: 2, failed: 0 })
    expect(TestBatcher.inserted).toEqual([['r1', 'r2']])
    expect(readFileSync(join(tmp, 'replay.jsonl'), 'utf-8')).toBe('')
  })

  it('reports a missing dead-letter file as a no-op', async () => {
    const log = { info: vi.fn(), error: vi.fn() } as never
    const result = await replayDeadLetter(
      join(tmp, 'does-not-exist.jsonl'),
      (line) => line,
      () => undefined,
      log,
    )
    expect(result).toEqual({ replayed: 0, failed: 0 })
  })
})
