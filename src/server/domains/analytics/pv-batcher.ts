import type { EntityTarget } from '@/server/infra/db/target'

import { incrementMetricPv, incrementMetricPvBatch } from '@/server/infra/db/operations/metric'
import { targetKey } from '@/server/infra/db/target'
import { getLogger } from '@/server/infra/logger'
import { registerShutdownHook } from '@/server/infra/shutdown'

// In-memory aggregator for high-frequency counters. We currently track page
// views (every request to a post page bumps the same counter) but the same
// pattern could apply to other "fire and forget" stats.
//
// Flush triggers:
//  - The buffered count for any single key reaches `flushThreshold`.
//  - Time since last flush exceeds `flushIntervalMs` (lazy timer set on the
//    first increment after a flush).
//  - The Node process gets SIGTERM/SIGINT/exit (best-effort flush).
//
// Note: in dev React Router may re-evaluate server modules on every request,
// which would create multiple batchers — we guard by attaching the instance
// to globalThis to keep one per process.

interface BatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

const log = getLogger('metrics.batcher')

class PageViewBatcher {
  private buffer = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null
  private flushing: Promise<void> | null = null

  constructor(private readonly opts: BatcherOptions) {
    registerShutdownHook(() => this.flush())
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
      this.timer.unref?.()
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      return this.flushing
    }
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
        await incrementMetricPvBatch(snapshot)
        log.debug('flushed page views', { keys: snapshot.size })
      } catch (err) {
        log.error('flush failed; restoring buffer', { err: String(err), keys: snapshot.size })
        // Restore any counts that were lost so we try again on the next tick.
        for (const [k, v] of snapshot) {
          this.buffer.set(k, (this.buffer.get(k) ?? 0) + v)
        }
      } finally {
        this.flushing = null
      }
    })()

    return this.flushing
  }
}

let batcher: PageViewBatcher | undefined

function getBatcher(): PageViewBatcher {
  if (batcher === undefined) {
    batcher = new PageViewBatcher({
      flushIntervalMs: 60_000,
      flushThreshold: 50,
    })
  }
  return batcher
}

export function resetPageViewBatcher(): void {
  batcher = undefined
}

// Single source of truth for page-view increments.
//
// We intentionally write through directly instead of relying on the in-memory
// batcher so production deployments with short-lived/ephemeral workers do not
// lose buffered increments before a timer flush runs.
export function bumpPageView(target: EntityTarget): void {
  void incrementMetricPv(target).catch((err) => {
    log.error('direct page-view increment failed', { err: String(err), target: targetKey(target) })
  })
}

export function flushPageViews(): Promise<void> {
  return getBatcher().flush()
}
