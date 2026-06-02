import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { EntityTarget } from '@/server/infra/db/target'

import { incrementMetricPvBatch } from '@/server/infra/db/operations/metric'
import { targetKey } from '@/server/infra/db/target'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

// In-memory aggregator for high-frequency counters. We currently track page
// views (every request to a post page bumps the same counter) but the same
// pattern could apply to other "fire and forget" stats.
//
// Flush triggers:
//  - The buffered count for any single key reaches `flushThreshold`.
//  - Time since last flush exceeds `flushIntervalMs` (lazy timer set on the
//    first increment after a flush).
//  - The Node process gets SIGTERM/SIGINT/exit (best-effort flush).

interface BatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

const log = getLogger('metrics.batcher')

class PageViewBatcher {
  private buffer = new Map<string, number>()
  /** Counts from the last failed flush that still need to be written. */
  private failed = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null
  private flushing: Promise<void> | null = null

  constructor(
    private readonly opts: BatcherOptions,
    private readonly db: NodePgDatabase,
  ) {
    registerShutdownHook(() => this.flush(), 100)
  }

  increment(key: string): void {
    const next = (this.buffer.get(key) ?? 0) + 1
    this.buffer.set(key, next)

    if (next >= this.opts.flushThreshold) {
      void this.flush()
      return
    }

    if (this.timer === null) {
      this.timer = setTimeout(() => {
        void this.flush()
      }, this.opts.flushIntervalMs)
      // Don't keep the event loop alive solely for this timer.
      this.timer.unref()
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      return this.flushing
    }

    // Merge any previously-failed counts back into the buffer before
    // taking a new snapshot.  This keeps the failed queue isolated so
    // increments that arrive while a flush is in flight never get mixed
    // with the snapshot in a way that could double-count.
    for (const [k, v] of this.failed) {
      this.buffer.set(k, (this.buffer.get(k) ?? 0) + v)
    }
    this.failed.clear()

    if (this.buffer.size === 0) {
      return
    }

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const snapshot = this.buffer
    this.buffer = new Map()

    this.flushing = (async () => {
      try {
        await incrementMetricPvBatch(this.db, snapshot)
        log.debug('flushed page views', { keys: snapshot.size })
      } catch (err) {
        log.error('flush failed; queuing for retry', { err: String(err), keys: snapshot.size })
        // Stash the snapshot in `failed` so the next flush attempt
        // retries these counts without contaminating new increments.
        for (const [k, v] of snapshot) {
          this.failed.set(k, (this.failed.get(k) ?? 0) + v)
        }
      } finally {
        this.flushing = null
      }
    })()

    return this.flushing
  }
}

let batcher: PageViewBatcher | undefined

export function initPageViewBatcher(db: NodePgDatabase): void {
  batcher = new PageViewBatcher(
    {
      flushIntervalMs: 60_000,
      flushThreshold: 50,
    },
    db,
  )
}

export function resetPageViewBatcher(): void {
  batcher = undefined
}

export function bumpPageView(target: EntityTarget): void {
  if (!batcher) {
    throw new Error('PageViewBatcher not initialized — call initPageViewBatcher(db) first')
  }
  batcher.increment(targetKey(target))
}

export function flushPageViews(): Promise<void> {
  if (!batcher) {
    return Promise.resolve()
  }
  return batcher.flush()
}
