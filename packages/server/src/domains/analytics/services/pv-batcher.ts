import type { Database } from '@kobato/db/sqlite/database'
import type { EntityTarget } from '@kobato/db/sqlite/target'

import { databaseOf } from '@kobato/db/sqlite/database'
import { incrementMetricPvBatch } from '@kobato/db/sqlite/operations/system/metric'
import { targetKey } from '@kobato/db/sqlite/target'
import { getBatcher, registerBatcher, requireBatcher } from '@kobato/server/infra/db/batcher-registry'
import { FlushLoop } from '@kobato/server/infra/db/insert-batcher'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('metrics.batcher')

interface BatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

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

  pendingDelta(key: string): number {
    return this.buffer.get(key) ?? 0
  }

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

registerBatcher(
  BATCHER_NAME,
  (handle) =>
    new PageViewBatcher(
      {
        flushIntervalMs: 60_000,
        flushThreshold: 50,
      },
      databaseOf(handle),
    ),
)

export function bumpPageView(target: EntityTarget): void {
  requireBatcher<PageViewBatcher>(BATCHER_NAME).increment(targetKey(target))
}

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
