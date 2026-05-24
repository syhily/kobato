import type { PoolClient } from 'pg'

import { appendFile, readFile, rename, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { from as copyFrom } from 'pg-copy-streams'

import { pool } from '@/server/infra/db/pool'
import { getLogger, type Logger } from '@/server/infra/logger'
import { registerShutdownHook } from '@/server/infra/shutdown'

export interface CopyBatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

// Generic in-memory batcher that flushes rows via `COPY FROM STDIN`.
// Subclasses provide `toCsvRow()` for event serialization and
// `onCopyFailed()` for domain-specific error handling (dead-letter,
// INSERT fallback, etc.).
//
// Flush triggers:
//   - Buffer reaches `flushThreshold`.
//   - `flushIntervalMs` elapses since the first push after the last
//     flush (lazy timer, `.unref()` so it doesn't keep Node alive).
//   - Process receives SIGTERM / SIGINT / `beforeExit` (via
//     `registerShutdownHook`).
export abstract class CopyBatcher<T> {
  private buffer: T[] = []
  private timer: NodeJS.Timeout | null = null
  private flushing: Promise<void> | null = null
  protected readonly log: Logger

  constructor(
    private readonly opts: CopyBatcherOptions,
    private readonly table: string,
    private readonly columns: readonly string[],
    scope: string,
  ) {
    this.log = getLogger(scope)
    registerShutdownHook(() => this.flush())
  }

  /** Serialize one event to a CSV row (single line, `\n`-terminated). */
  protected abstract toCsvRow(event: T): string

  /** Called when COPY fails. Implement INSERT fallback or dead-letter here. */
  protected abstract onCopyFailed(events: T[], error: unknown): Promise<void>

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
      this.timer.unref?.()
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      return this.flushing
    }
    if (this.buffer.length === 0) {
      return
    }

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const snapshot = this.buffer
    this.buffer = []

    this.flushing = (async () => {
      try {
        await this.copyToDb(snapshot)
        this.log.debug('flushed batch', { count: snapshot.length })
      } catch (err) {
        this.log.error('COPY failed', {
          err: err instanceof Error ? err.message : String(err),
          count: snapshot.length,
        })
        await this.onCopyFailed(snapshot, err)
      } finally {
        this.flushing = null
      }
    })()

    return this.flushing
  }

  /** Write events directly via COPY (used by dead-letter replay). */
  async ingest(events: T[]): Promise<void> {
    await this.copyToDb(events)
  }

  protected async copyToDb(events: T[]): Promise<void> {
    let client: PoolClient | undefined
    try {
      client = await pool.connect()
      const sql = `COPY ${this.table} (${this.columns.join(', ')}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`
      const stream = client.query(copyFrom(sql))
      const source = Readable.from(events.map((e) => this.toCsvRow(e)))
      await pipeline(source, stream)
    } finally {
      client?.release()
    }
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
  reingest: (events: T[]) => Promise<void>,
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
