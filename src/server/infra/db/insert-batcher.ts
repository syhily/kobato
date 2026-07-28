import { appendFile, readFile, rename, writeFile } from 'node:fs/promises'

import type { Database } from '@/server/infra/db/database'

import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger, type Logger } from '@/server/infra/logger'

export interface InsertBatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

export interface FlushResult {
  committed: number
  deadLettered: number
}

// Generic in-memory batcher that flushes rows via one multi-row INSERT
// in a single sync transaction — the shape SQLite excels at, and the
// replacement for the old Postgres `COPY FROM STDIN` path with no loss
// of durability (WAL + one commit per batch). Subclasses provide
// `insertBatch()` for the write itself and `onInsertFailed()` for
// domain-specific error handling (dead-letter, per-row fallback, etc.).
//
// Flush triggers:
//   - Buffer reaches `flushThreshold`.
//   - `flushIntervalMs` elapses since the first push after the last
//     flush (lazy timer, `.unref()` so it doesn't keep Node alive).
//   - Process receives SIGTERM / SIGINT / `beforeExit` (via
//     `registerShutdownHook` with priority 100 so flushers run before
//     the database-close hook at priority 0).
export abstract class InsertBatcher<T> {
  private buffer: T[] = []
  private timer: NodeJS.Timeout | null = null
  private flushing: Promise<FlushResult> | null = null
  protected readonly log: Logger

  constructor(
    private readonly opts: InsertBatcherOptions,
    scope: string,
    private readonly db: Database,
  ) {
    this.log = getLogger(scope)
    registerShutdownHook(async () => {
      void (await this.flush())
    }, 100)
  }

  /** Insert the whole batch in one transaction. Sync for node:sqlite;
   * may be async for engines with an async client (DuckDB). */
  protected abstract insertBatch(db: Database, events: T[]): void | Promise<void>

  /** Called when the batch insert fails. Implement per-row fallback or dead-letter here. */
  protected abstract onInsertFailed(events: T[], error: unknown): Promise<FlushResult>

  push(event: T): void {
    this.buffer.push(event)

    if (this.buffer.length >= this.opts.flushThreshold) {
      void this.flush()
      return
    }

    if (this.timer === null) {
      this.timer = setTimeout(() => {
        void this.flush()
      }, this.opts.flushIntervalMs)
      this.timer.unref()
    }
  }

  async flush(): Promise<FlushResult> {
    if (this.flushing) {
      return this.flushing
    }
    if (this.buffer.length === 0) {
      return { committed: 0, deadLettered: 0 }
    }

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const snapshot = this.buffer
    this.buffer = []

    this.flushing = (async () => {
      try {
        await this.insertBatch(this.db, snapshot)
        this.log.debug('flushed batch', { count: snapshot.length })
        return { committed: snapshot.length, deadLettered: 0 } as FlushResult
      } catch (err) {
        this.log.error('batch insert failed', {
          err: err instanceof Error ? err.message : String(err),
          count: snapshot.length,
        })
        return await this.onInsertFailed(snapshot, err)
      } finally {
        this.flushing = null
      }
    })()

    return this.flushing
  }

  /** Write events directly (used by dead-letter replay). */
  ingest(events: T[]): void | Promise<void> {
    return this.insertBatch(this.db, events)
  }
}

// ─── dead-letter helpers ──────────────────────────────────

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
