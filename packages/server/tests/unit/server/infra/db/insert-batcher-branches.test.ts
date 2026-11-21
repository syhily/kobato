import type { Database } from '@kobato/db/database'

import {
  DEFAULT_MAX_BUFFER_SIZE,
  InsertBatcher,
  type FlushResult,
  replayDeadLetter,
  writeDeadLetter,
} from '@kobato/server/infra/db/insert-batcher'
import { __getLifecycleContainer } from '@kobato/server/infra/lifecycle'
import { __clearLogCaptureForTests, __logCaptureForTests, getLogger } from '@kobato/server/infra/logger'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const tmp = mkdtempSync(join(tmpdir(), 'insert-batcher-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const liveBatchers: InsertBatcher<string>[] = []
function track<T extends InsertBatcher<string>>(batcher: T): T {
  liveBatchers.push(batcher)
  return batcher
}
afterAll(() => {
  for (const batcher of liveBatchers) {
    batcher.dispose()
  }
  liveBatchers.length = 0
})

function fakeDb(): Database {
  return {} as Database
}

const log = getLogger('insert-batcher-test')

function bufferFullWarns() {
  return __logCaptureForTests().filter((entry) => entry.msg === 'insert batcher buffer full; dropping incoming events')
}

class TestBatcher extends InsertBatcher<string> {
  static inserted: string[][] = []
  static failNext = false
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
    await writeDeadLetter(events, (es) => es.join('\n') + '\n', join(tmp, 'dead-letter.jsonl'), log)
    return { committed: 0, deadLettered: events.length }
  }
}

describe('server/infra/db/insert-batcher — flush mechanics', () => {
  it('flushes the whole buffer as one batch at the threshold', async () => {
    TestBatcher.inserted = []
    const batcher = track(new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 3 }, 'test', () => fakeDb()))
    batcher.push('a')
    batcher.push('b')
    batcher.push('c')
    const result = await batcher.flush()
    expect(result).toEqual({ committed: 3, deadLettered: 0 })
    expect(TestBatcher.inserted).toEqual([['a', 'b', 'c']])
  })

  it('pause drains the buffer then holds every flush trigger; resume flushes what buffered during the pause', async () => {
    TestBatcher.inserted = []
    const batcher = track(new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 100 }, 'test', () => fakeDb()))
    batcher.push('before')
    await batcher.pause()
    expect(TestBatcher.inserted).toEqual([['before']])

    batcher.push('during')
    const held = await batcher.flush()
    expect(held).toEqual({ committed: 0, deadLettered: 0 })
    expect(TestBatcher.inserted).toEqual([['before']])

    batcher.resume()
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
      const gated = track(
        new (class extends TestBatcher {
          protected override async insertBatch(_db: Database, events: string[]): Promise<void> {
            await gate
            TestBatcher.inserted.push(events)
          }
        })({ flushIntervalMs: 60_000, flushThreshold: 1 }, 'test', () => fakeDb()),
      )

      gated.push('a')
      const pausePromise = gated.pause()
      gated.push('b')
      release()
      await pausePromise
      expect(TestBatcher.inserted).toEqual([['a'], ['b']])

      gated.push('c')
      gated.push('d')
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

  it('flushForTeardown drains rows buffered during a pause while flush() stays gated', async () => {
    TestBatcher.inserted = []
    const batcher = track(new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 100 }, 'test', () => fakeDb()))
    await batcher.pause()
    batcher.push('held')

    expect(await batcher.flush()).toEqual({ committed: 0, deadLettered: 0 })
    expect(TestBatcher.inserted).toEqual([])

    expect(await batcher.flushForTeardown()).toEqual({ committed: 1, deadLettered: 0 })
    expect(TestBatcher.inserted).toEqual([['held']])
    batcher.resume()
  })

  it('the shutdown hook flushes through the pause gate (SIGTERM inside a backup window)', async () => {
    TestBatcher.inserted = []
    const hooks = __getLifecycleContainer().hooks
    const known = new Set(hooks.map((entry) => entry.fn))
    const batcher = track(new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 100 }, 'test', () => fakeDb()))
    await batcher.pause()
    batcher.push('sigterm-window')

    const entry = hooks.find((hook) => !known.has(hook.fn))
    expect(entry).toBeDefined()
    await entry!.fn()

    expect(TestBatcher.inserted).toEqual([['sigterm-window']])
    batcher.resume()
  })

  it('neither the interval timer nor the threshold fires while paused', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      const batcher = track(new TestBatcher({ flushIntervalMs: 1_000, flushThreshold: 2 }, 'test', () => fakeDb()))
      await batcher.pause()
      batcher.push('a')
      batcher.push('b')

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
      const batcher = track(new TestBatcher({ flushIntervalMs: 1_000, flushThreshold: 3 }, 'test', () => fakeDb()))
      batcher.push('a')
      batcher.push('b')
      batcher.push('c')
      expect(TestBatcher.inserted).toEqual([['a', 'b', 'c']])

      batcher.push('d')
      batcher.push('e')
      batcher.push('f')
      release()
      TestBatcher.gate = null
      await batcher.flush()
      expect(TestBatcher.inserted).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ])

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
      let release!: (error: Error) => void
      const gate = new Promise<void>((_resolve, reject) => {
        release = reject
      })
      const failing = track(
        new (class extends TestBatcher {
          private failArmed = true
          protected override async insertBatch(_db: Database, events: string[]): Promise<void> {
            if (this.failArmed) {
              this.failArmed = false
              await gate
            }
            TestBatcher.inserted.push(events)
          }
        })({ flushIntervalMs: 1_000, flushThreshold: 3 }, 'test', () => fakeDb()),
      )

      failing.push('a')
      failing.push('b')
      failing.push('c')
      failing.push('d')
      await vi.advanceTimersByTimeAsync(1_000)
      failing.push('e')
      await vi.advanceTimersByTimeAsync(1_000)
      failing.push('f')
      expect(TestBatcher.inserted).toEqual([])

      release(new Error('insert failed'))
      const result = await failing.flush()
      expect(result).toEqual({ committed: 0, deadLettered: 3 })
      expect(TestBatcher.inserted).toEqual([])

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
    const batcher = track(new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 2 }, 'test', () => fakeDb()))
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
    const batcher = track(new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 10 }, 'test', () => fakeDb()))
    TestBatcher.inserted = []
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
    const result = await replayDeadLetter(
      join(tmp, 'does-not-exist.jsonl'),
      (line) => line,
      () => undefined,
      log,
    )
    expect(result).toEqual({ replayed: 0, failed: 0 })
  })
})

describe('server/infra/db/insert-batcher — buffer cap', () => {
  it('drops events past the cap instead of growing the heap, warning once per burst', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      __clearLogCaptureForTests()
      const batcher = track(
        new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 1_000, maxBufferSize: 5 }, 'test', () => fakeDb()),
      )

      for (let i = 0; i < 8; i += 1) {
        batcher.push(`e${i}`)
      }

      expect(await batcher.flush()).toEqual({ committed: 5, deadLettered: 0 })
      expect(TestBatcher.inserted).toEqual([['e0', 'e1', 'e2', 'e3', 'e4']])
      const warns = bufferFullWarns()
      expect(warns).toHaveLength(1)
      expect(warns[0].ctx).toMatchObject({ maxBufferSize: 5, dropped: 1 })
      expect(warns[0].level).toBe('warn')
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts drops cumulatively across bursts', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      __clearLogCaptureForTests()
      const batcher = track(
        new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: 1_000, maxBufferSize: 2 }, 'test', () => fakeDb()),
      )

      batcher.push('a')
      batcher.push('b')
      batcher.push('drop-1')
      batcher.push('drop-2')
      await batcher.flush()

      batcher.push('c')
      batcher.push('d')
      batcher.push('drop-3')
      expect(await batcher.flush()).toEqual({ committed: 2, deadLettered: 0 })

      expect(TestBatcher.inserted).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ])
      const warns = bufferFullWarns()
      expect(warns).toHaveLength(2)
      expect(warns[1].ctx).toMatchObject({ maxBufferSize: 2, dropped: 3 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('defaults to DEFAULT_MAX_BUFFER_SIZE', async () => {
    vi.useFakeTimers()
    try {
      TestBatcher.inserted = []
      __clearLogCaptureForTests()
      const batcher = track(
        new TestBatcher({ flushIntervalMs: 60_000, flushThreshold: DEFAULT_MAX_BUFFER_SIZE + 1 }, 'test', () =>
          fakeDb(),
        ),
      )

      for (let i = 0; i <= DEFAULT_MAX_BUFFER_SIZE; i += 1) {
        batcher.push('e')
      }

      expect(await batcher.flush()).toEqual({ committed: DEFAULT_MAX_BUFFER_SIZE, deadLettered: 0 })
      expect(TestBatcher.inserted[0]).toHaveLength(DEFAULT_MAX_BUFFER_SIZE)
      expect(bufferFullWarns()).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
