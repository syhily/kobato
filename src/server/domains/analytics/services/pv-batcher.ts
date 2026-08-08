import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'

import { getBatcher, registerBatcher, requireBatcher } from '@/server/infra/db/batcher-registry'
import { FlushLoop } from '@/server/infra/db/insert-batcher'
import { incrementMetricPvBatch } from '@/server/infra/db/operations/metric'
import { targetKey } from '@/server/infra/db/target'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('metrics.batcher')

interface BatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

// In-memory counter aggregator for high-frequency page views. Shares
// the FlushLoop skeleton with the insert batchers; on failure it merges
// the snapshot back for a retry instead of dead-lettering rows.
class PageViewBatcher extends FlushLoop<Map<string, number>, void> {
  private buffer = new Map<string, number>()

  constructor(
    private readonly opts: BatcherOptions,
    private readonly db: Database,
  ) {
    super(opts.flushIntervalMs, 'metrics.batcher', undefined)
  }

  protected takePending(): Map<string, number> | null {
    if (this.buffer.size === 0) {
      return null
    }
    const snapshot = this.buffer
    this.buffer = new Map()
    return snapshot
  }

  protected async writePending(pending: Map<string, number>): Promise<void> {
    await incrementMetricPvBatch(this.db, pending)
    log.debug('flushed page views', { keys: pending.size })
  }

  protected onWriteFailed(pending: Map<string, number>, error: unknown): void {
    log.error('flush failed; counts retry with the next batch', {
      err: error instanceof Error ? error.message : String(error),
      keys: pending.size,
    })
    // Merge the snapshot back (the fresh buffer holds increments that
    // arrived mid-flush) and re-arm — the retry must not be lost.
    for (const [key, count] of pending) {
      this.buffer.set(key, (this.buffer.get(key) ?? 0) + count)
    }
    this.armFlushTimer()
  }

  increment(key: string): void {
    const next = (this.buffer.get(key) ?? 0) + 1
    this.buffer.set(key, next)

    if (next >= this.opts.flushThreshold) {
      void this.flush()
      return
    }

    this.armFlushTimer()
  }

  /**
   * Unflushed delta for one key — the read-time-merge half of the
   * batcher. Peeks without detaching.
   */
  pendingDelta(key: string): number {
    return this.buffer.get(key) ?? 0
  }

  /** Detach the shutdown hook (registry reset on restore — see InsertBatcher). */
  override dispose(): void {
    if (this.buffer.size > 0) {
      log.warn('page-view batcher dropped with unflushed counts', {
        keys: this.buffer.size,
      })
    }
    super.dispose()
  }
}

const BATCHER_NAME = 'PageViewBatcher'

// Self-register so the bootstrap lifecycle drives every batcher
// through one vocabulary (`initAllBatchers` / `flushAllBatchers` /
// `resetAllBatchers` / `replayAllDeadLetters`).
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

/**
 * Read-time merge for view counters: readers add the unflushed delta
 * to serve an exact count. Returns 0 when the batcher is not running.
 */
export function pendingViewDelta(target: EntityTarget): number {
  return getBatcher<PageViewBatcher>(BATCHER_NAME)?.pendingDelta(targetKey(target)) ?? 0
}

export function flushPageViews(): Promise<void> {
  const batcher = getBatcher<PageViewBatcher>(BATCHER_NAME)
  if (!batcher) {
    return Promise.resolve()
  }
  return batcher.flush()
}
