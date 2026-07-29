import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'

import { getBatcher, registerBatcher, requireBatcher } from '@/server/infra/db/batcher-registry'
import { incrementMetricPvBatch } from '@/server/infra/db/operations/metric'
import { targetKey } from '@/server/infra/db/target'
import { registerShutdownHook, unregisterShutdownHook } from '@/server/infra/lifecycle'
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
  private readonly shutdownHook: () => Promise<void>

  constructor(
    private readonly opts: BatcherOptions,
    private readonly db: Database,
  ) {
    this.shutdownHook = () => this.flush()
    registerShutdownHook(this.shutdownHook, 100)
  }

  /** Detach the shutdown hook (registry reset on restore — see InsertBatcher). */
  dispose(): void {
    if (this.buffer.size > 0 || this.failed.size > 0) {
      log.warn('page-view batcher dropped with unflushed counts', {
        buffered: this.buffer.size,
        retryPending: this.failed.size,
      })
    }
    unregisterShutdownHook(this.shutdownHook)
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

const BATCHER_NAME = 'PageViewBatcher'

// Second implementation of the batching seam alongside `InsertBatcher`:
// insert batchers buffer whole rows, while this one aggregates counters in
// a Map and flushes upserts with merge-back retry instead of dead-letter.
// Both self-register on the same registry so the bootstrap lifecycle
// drives them through one vocabulary.
registerBatcher(
  BATCHER_NAME,
  (handle) =>
    new PageViewBatcher(
      {
        flushIntervalMs: 60_000,
        flushThreshold: 50,
      },
      handle.db,
    ),
)

export function bumpPageView(target: EntityTarget): void {
  requireBatcher<PageViewBatcher>(BATCHER_NAME).increment(targetKey(target))
}

export function flushPageViews(): Promise<void> {
  const batcher = getBatcher<PageViewBatcher>(BATCHER_NAME)
  if (!batcher) {
    return Promise.resolve()
  }
  return batcher.flush()
}
