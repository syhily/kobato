import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

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
  /** When set, the async write parks on this promise — the flush stays
   *  in flight so the test can push events across the threshold mid-flush. */
  static gate: Promise<void> | null = null

  protected insertBatch(_db: Database, events: string[]): void | Promise<void> {
    if (TestBatcher.failNext) {
      TestBatcher.failNext = false
      throw new Error('insert failed')
    }
    TestBatcher.inserted.push(events)
    return TestBatcher.gate ?? undefined
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

  it('pause drains the buffer then holds every flush trigger; resume flushes what buffered during the pause', async () => {
    TestBatcher.inserted = []
    const batcher = new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 100 }, 'test', () => fakeDb())
    batcher.push('before')
    await batcher.pause()
    // The pause drained the pre-pause buffer first.
    expect(TestBatcher.inserted).toEqual([['before']])

    batcher.push('during')
    // While paused even an explicit flush is a no-op — the consistency
    // window (backup CHECKPOINT + copy) stays write-free.
    const held = await batcher.flush()
    expect(held).toEqual({ committed: 0, deadLettered: 0 })
    expect(TestBatcher.inserted).toEqual([['before']])

    batcher.resume()
    // resume fires an immediate flush; join it through the singleflight.
    const result = await batcher.flush()
    expect(result).toEqual({ committed: 1, deadLettered: 0 })
    expect(TestBatcher.inserted).toEqual([['before'], ['during']])
  })

  it('pause gates before draining: joins an in-flight flush, absorbs stragglers, holds what arrives after', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const gated = new (class extends TestBatcher {
        protected override async insertBatch(_db: Database, events: string[]): Promise<void> {
          await gate
          TestBatcher.inserted.push(events)
        }
      })({ flushIntervalMs: 60_000, flushThreshold: 1 }, 'test', () => fakeDb())

      gated.push('a') // threshold → flush starts, parks on the gate
      const pausePromise = gated.pause() // the gate is up synchronously; pause joins the in-flight flush
      gated.push('b') // cannot start a write of its own — only the join may absorb it
      release()
      await pausePromise
      // 'b' arrived while the in-flight write was parked and was absorbed
      // by its drain loop — still inside pause(), i.e. before the
      // consistency window the caller opens after pause resolves.
      expect(TestBatcher.inserted).toEqual([['a'], ['b']])

      // After the pause resolved nothing writes: interval and threshold
      // triggers are both held.
      gated.push('c')
      gated.push('d') // crosses the threshold
      await vi.advanceTimersByTimeAsync(60_000)
      expect(TestBatcher.inserted).toEqual([['a'], ['b']])

      gated.resume()
      const result = await gated.flush()
      expect(result).toEqual({ committed: 2, deadLettered: 0 })
      expect(TestBatcher.inserted).toEqual([['a'], ['b'], ['c', 'd']])
    } finally {
      vi.useRealTimers()
    }
  })

  it('neither the interval timer nor the threshold fires while paused', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      const batcher = new TestBatcher({ flushIntervalMs: 1_000, flushThreshold: 2 }, 'test', () => fakeDb())
      await batcher.pause()
      batcher.push('a')
      batcher.push('b') // crosses the flush threshold

      await vi.advanceTimersByTimeAsync(60_000)
      expect(TestBatcher.inserted).toEqual([])

      batcher.resume()
      const result = await batcher.flush()
      expect(result).toEqual({ committed: 2, deadLettered: 0 })
      expect(TestBatcher.inserted).toEqual([['a', 'b']])
    } finally {
      vi.useRealTimers()
    }
  })

  it('drains events pushed across the threshold while a flush is in flight (no starvation)', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      let release!: () => void
      TestBatcher.gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const batcher = new TestBatcher({ flushIntervalMs: 1_000, flushThreshold: 3 }, 'test', () => fakeDb())
      batcher.push('a')
      batcher.push('b')
      batcher.push('c') // threshold → flush starts, parks on the gate
      expect(TestBatcher.inserted).toEqual([['a', 'b', 'c']])

      // The starvation shape: the threshold is crossed AGAIN while the
      // first flush is in flight (the push's flush() joins the
      // singleflight and schedules nothing), and these are the last
      // events ever — no later push and no interval timer may be the
      // saviour.
      batcher.push('d')
      batcher.push('e')
      batcher.push('f')
      release()
      TestBatcher.gate = null
      await batcher.flush() // join the singleflight; the drain must follow
      expect(TestBatcher.inserted).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ])

      // No latent trigger may remain either: advancing several intervals
      // produces nothing, because the buffer is empty and no orphaned
      // timer was left behind.
      await vi.advanceTimersByTimeAsync(10_000)
      expect(TestBatcher.inserted).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ])
    } finally {
      TestBatcher.gate = null
      vi.useRealTimers()
    }
  })

  it('re-arms the flush after a write failure when every mid-flush trigger was consumed (no stranded rows)', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      // The first write parks on the gate, then rejects once released —
      // the failure lands AFTER new events buffered mid-flush.
      let release!: (error: Error) => void
      const gate = new Promise<void>((_resolve, reject) => {
        release = reject
      })
      const failing = new (class extends TestBatcher {
        private failArmed = true
        protected override async insertBatch(_db: Database, events: string[]): Promise<void> {
          if (this.failArmed) {
            this.failArmed = false
            await gate // rejects → the whole batch dead-letters
          }
          TestBatcher.inserted.push(events)
        }
      })({ flushIntervalMs: 1_000, flushThreshold: 3 }, 'test', () => fakeDb())

      failing.push('a')
      failing.push('b')
      failing.push('c') // threshold → flush starts, parks on the gate
      // The stranding shape: rows buffer while the doomed write is in
      // flight, and every trigger they produce is CONSUMED by the
      // singleflight before the failure settles — each sub-threshold
      // push arms the interval timer, each timer fires into the
      // in-flight flush (a no-op join), and the threshold-crossing push
      // arms nothing at all.
      failing.push('d')
      await vi.advanceTimersByTimeAsync(1_000) // timer fires mid-flush: no-op, consumed
      failing.push('e')
      await vi.advanceTimersByTimeAsync(1_000) // same
      failing.push('f') // threshold → joins the singleflight, arms nothing
      expect(TestBatcher.inserted).toEqual([])

      release(new Error('insert failed'))
      const result = await failing.flush() // join; 'a..c' dead-letter
      expect(result).toEqual({ committed: 0, deadLettered: 3 })
      expect(TestBatcher.inserted).toEqual([])

      // 'd..f' have no trigger left — unless the settled flush re-arms
      // one, they strand until the next event or shutdown. The interval
      // must flush them.
      await vi.advanceTimersByTimeAsync(1_000)
      expect(TestBatcher.inserted).toEqual([['d', 'e', 'f']])
    } finally {
      vi.useRealTimers()
    }
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
