import type { Database } from '@kobato/db/database.ts'

import { toJsonSafe } from '@kobato/server/infra/json.ts'
import { registerShutdownHook, unregisterShutdownHook } from '@kobato/server/infra/lifecycle.ts'
import { getLogger, type Logger } from '@kobato/server/infra/logger.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises'

export interface InsertBatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
  /**
   * Hard cap on buffered events (`DEFAULT_MAX_BUFFER_SIZE` when omitted): a
   * stalled writer would otherwise let a flood grow the heap without bound —
   * past this point events are dropped and counted.
   */
  maxBufferSize?: number
}

export const DEFAULT_MAX_BUFFER_SIZE = 10_000

export interface FlushResult {
  committed: number
  deadLettered: number
}

export abstract class FlushLoop<Pending, Result> {
  private timer: NodeJS.Timeout | null = null
  private flushing: Promise<Result> | null = null
  private paused = false
  protected readonly log: Logger
  private readonly shutdownHook: () => Promise<void>

  constructor(
    private readonly flushIntervalMs: number,
    scope: string,
    private readonly emptyResult: Result,
  ) {
    this.log = getLogger(scope)
    this.shutdownHook = async () => {
      void (await this.flushForTeardown())
    }
    registerShutdownHook(this.shutdownHook, 100)
  }

  dispose(): void {
    unregisterShutdownHook(this.shutdownHook)
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.takePending()
  }

  protected abstract takePending(): Pending | null

  protected abstract writePending(pending: Pending): Result | Promise<Result>

  protected abstract onWriteFailed(pending: Pending, error: unknown): Result | Promise<Result>

  protected armFlushTimer(): void {
    if (this.paused) {
      return
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null
        void this.flush()
      }, this.flushIntervalMs)
      this.timer.unref()
    }
  }

  /**
   * Quiesce the loop for an external consistency window: drain, then
   * hold pushes and timers until `resume`. Teardown flushes still drain
   * inside the window.
   */
  async pause(): Promise<void> {
    if (this.paused) {
      return
    }
    this.paused = true
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.flushing !== null) {
      await this.flushing
    }
    await this.drain()
  }

  resume(): void {
    if (!this.paused) {
      return
    }
    this.paused = false
    void this.flush()
  }

  async flush(): Promise<Result> {
    if (this.paused) {
      return this.emptyResult
    }
    return this.drain()
  }

  /**
   * Teardown flush (shutdown hook, restore swap): drains even while
   * paused — the last chance to write rows before `dispose()` drops them.
   */
  async flushForTeardown(): Promise<Result> {
    return this.drain()
  }

  /**
   * Join an in-flight flush WITHOUT draining pending payload — the quiesce
   * point for a teardown that closes the writer underneath (engine swap,
   * test-side handle close). Never rejects: a failed flush already reported
   * itself through onWriteFailed.
   */
  settle(): Promise<Result> {
    return (this.flushing ?? Promise.resolve(this.emptyResult)).catch(() => this.emptyResult)
  }

  private async drain(): Promise<Result> {
    if (this.flushing) {
      return this.flushing
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const pending = this.takePending()
    if (pending === null) {
      return this.emptyResult
    }
    this.flushing = (async () => {
      let current: Pending = pending
      try {
        for (;;) {
          let result: Result
          try {
            result = await this.writePending(current)
          } catch (error) {
            const failed = await this.onWriteFailed(current, error)
            this.armFlushTimer()
            return failed
          }
          const more = this.takePending()
          if (more === null) {
            return result
          }
          current = more
        }
      } finally {
        this.flushing = null
      }
    })()
    return this.flushing
  }
}

export abstract class InsertBatcher<T, W = Database> extends FlushLoop<T[], FlushResult> {
  private buffer: T[] = []
  private readonly maxBufferSize: number
  private dropped = 0
  private overflowing = false

  constructor(
    private readonly opts: InsertBatcherOptions,
    scope: string,
    private readonly resolveWriter: () => W,
  ) {
    super(opts.flushIntervalMs, scope, { committed: 0, deadLettered: 0 })
    this.maxBufferSize = opts.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE
  }

  protected takePending(): T[] | null {
    if (this.buffer.length === 0) {
      return null
    }
    const snapshot = this.buffer
    this.buffer = []
    return snapshot
  }

  protected async writePending(pending: T[]): Promise<FlushResult> {
    await this.insertBatch(this.resolveWriter(), pending)
    this.log.debug('flushed batch', { count: pending.length })
    return { committed: pending.length, deadLettered: 0 }
  }

  protected async onWriteFailed(pending: T[], error: unknown): Promise<FlushResult> {
    this.log.error('batch insert failed', {
      err: error instanceof Error ? error.message : String(error),
      count: pending.length,
    })
    return this.onInsertFailed(pending, error)
  }

  protected abstract insertBatch(writer: W, events: T[]): void | Promise<void>

  protected abstract onInsertFailed(events: T[], error: unknown): Promise<FlushResult>

  push(event: T): void {
    if (this.buffer.length >= this.maxBufferSize) {
      this.dropped += 1
      if (!this.overflowing) {
        this.overflowing = true
        this.log.warn('insert batcher buffer full; dropping incoming events', {
          maxBufferSize: this.maxBufferSize,
          dropped: this.dropped,
        })
      }
      return
    }
    this.overflowing = false
    this.buffer.push(event)

    if (this.buffer.length >= this.opts.flushThreshold) {
      void this.flush()
      return
    }

    this.armFlushTimer()
  }

  ingest(events: T[]): void | Promise<void> {
    return this.insertBatch(this.resolveWriter(), events)
  }
}

export function serializeDeadLetterJsonLines(events: unknown[]): string {
  return events.map((event) => JSON.stringify(toJsonSafe(event))).join('\n') + '\n'
}

export function deserializeDeadLetterJsonLine<T>(
  line: string,
  revive: (raw: Record<string, unknown>) => T | null,
): T | null {
  try {
    const raw = unsafeCast<Record<string, unknown>>(JSON.parse(line))
    return revive(raw)
  } catch {
    return null
  }
}

export async function writeDeadLetter<T>(
  events: T[],
  serialize: (events: T[]) => string,
  path: string,
  log: Logger,
): Promise<void> {
  try {
    await appendFile(path, serialize(events), 'utf-8')
    log.info('wrote dead-letter batch', { path, count: events.length })
  } catch (writeErr) {
    log.error('dead-letter write also failed', {
      err: writeErr instanceof Error ? writeErr.message : String(writeErr),
      count: events.length,
    })
  }
}

export async function replayDeadLetter<T>(
  path: string,
  deserialize: (line: string) => T | null,
  reingest: (events: T[]) => void | Promise<void>,
  log: Logger,
): Promise<{ replayed: number; failed: number }> {
  let content: string
  try {
    content = await readFile(path, 'utf-8')
  } catch {
    log.info('no dead-letter file to replay', { path })
    return { replayed: 0, failed: 0 }
  }

  const lines = content.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) {
    return { replayed: 0, failed: 0 }
  }

  const events: T[] = []
  let failed = 0
  for (const line of lines) {
    const event = deserialize(line)
    if (event !== null) {
      events.push(event)
    } else {
      failed++
    }
  }

  let replayed = 0
  if (events.length > 0) {
    try {
      await reingest(events)
      log.info('replayed dead-letter batch', { count: events.length, path })
      const tmp = `${path}.replayed`
      await writeFile(tmp, '', 'utf-8')
      await rename(tmp, path)
      replayed = events.length
    } catch (err) {
      log.error('dead-letter replay also failed; keeping file', {
        err: err instanceof Error ? err.message : String(err),
        count: events.length,
        path,
      })
      failed += events.length
    }
  }

  return { replayed, failed }
}
