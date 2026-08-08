import { appendFile, readFile, rename, writeFile } from 'node:fs/promises'

import type { Database } from '@/server/infra/db/database'

import { registerShutdownHook, unregisterShutdownHook } from '@/server/infra/lifecycle'
import { getLogger, type Logger } from '@/server/infra/logger'
import { toJsonSafe } from '@/shared/utils/to-json-safe'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface InsertBatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

export interface FlushResult {
  committed: number
  deadLettered: number
}

// Shared flush-loop for buffered writers: lazy unref'd interval timer, singleflight
// drain with snapshot detach, shutdown-hook disposal. Teardown flushes ignore the
// pause gate; a flush drains until the payload is empty. Subclasses own takePending /
// writePending / onWriteFailed.
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

  /** Detach the shutdown hook, disarm the timer, drop pending payload (registry reset / restore). */
  dispose(): void {
    unregisterShutdownHook(this.shutdownHook)
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // Detach-and-discard: reset semantics are "start empty" — the restore flow already flushed.
    this.takePending()
  }

  /** Detach the pending payload for a flush (null = nothing pending). */
  protected abstract takePending(): Pending | null

  /** Write the detached batch. */
  protected abstract writePending(pending: Pending): Result | Promise<Result>

  /** Recover from a failed write (dead-letter, merge-back retry, …). */
  protected abstract onWriteFailed(pending: Pending, error: unknown): Result | Promise<Result>

  /** Arm the lazy interval flush — idempotent while a timer is pending. */
  protected armFlushTimer(): void {
    if (this.paused) {
      return
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        // Clear the field before flushing — a stale handle would wedge every future arm.
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
    // Set the pause flag before draining so a push can't start a flush inside the window.
    this.paused = true
    // A push that raced the drain may have armed a fresh timer — disarm it.
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // Join an in-flight flush, then drain events that arrived while it was parked.
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
    // Flush paused-time buffering immediately, not after a fresh interval.
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

  /** Singleflight drain — the shared write path for flush(), pause(), and flushForTeardown(). */
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
            // Recovery owns a failed batch — stop draining rather than hot-looping.
            const failed = await this.onWriteFailed(current, error)
            // Rows buffered mid-flush may have no trigger left; re-arm the interval so they flush.
            this.armFlushTimer()
            return failed
          }
          // Starvation guard: triggers swallowed by the singleflight never reschedule — drain until empty.
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

// Generic in-memory batcher: one multi-row INSERT per batch in a single
// sync transaction. The writer is a LAZY GETTER, not a captured handle —
// the DuckDB sidecar opens after registration, and restore reopens it.
export abstract class InsertBatcher<T, W = Database> extends FlushLoop<T[], FlushResult> {
  private buffer: T[] = []

  constructor(
    private readonly opts: InsertBatcherOptions,
    scope: string,
    private readonly resolveWriter: () => W,
  ) {
    super(opts.flushIntervalMs, scope, { committed: 0, deadLettered: 0 })
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

  /** Insert the whole batch in one transaction. Sync for node:sqlite;
   * may be async for engines with an async client (DuckDB). */
  protected abstract insertBatch(writer: W, events: T[]): void | Promise<void>

  /** Called when the batch insert fails. Implement per-row fallback or dead-letter here. */
  protected abstract onInsertFailed(events: T[], error: unknown): Promise<FlushResult>

  push(event: T): void {
    this.buffer.push(event)

    if (this.buffer.length >= this.opts.flushThreshold) {
      void this.flush()
      return
    }

    this.armFlushTimer()
  }

  /** Write events directly (used by dead-letter replay). */
  ingest(events: T[]): void | Promise<void> {
    return this.insertBatch(this.resolveWriter(), events)
  }
}

// Dead-letter wire format: one plain-JSON object per line, Dates as epoch ms.

/** Serialize a batch to JSON-lines (trailing newline included). */
export function serializeDeadLetterJsonLines<T>(events: T[]): string {
  return events.map((event) => JSON.stringify(toJsonSafe(event))).join('\n') + '\n'
}

/**
 * Parse one dead-letter line. `revive` returns null to count the line
 * as a parse failure.
 */
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
