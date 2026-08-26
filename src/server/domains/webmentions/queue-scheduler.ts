import type { Database } from '@/server/infra/db/database'

import { jobDb, registerJob } from '@/server/infra/job-registry'
import { getLogger } from '@/server/infra/logger'

// Single owner of the webmention queue-loop mechanics; the outbox / inbox /
// reverify scheduler modules were line-for-line clones of this. They keep
// their own exported seams (MIN_DELAY_MS constants + enqueue-path nudges)
// and supply policy through the closures below — `name` must stay
// `webmentions.<queue>`: the logger scope and the batch log line derive
// from it.

export interface QueueSchedulerOptions {
  /** `webmentions.<queue>` — logger scope is `${name}-scheduler`. */
  name: string
  findNextDueAt: (db: Database) => Date | 'now' | null
  runBatch: (db: Database) => Promise<number>
}

export interface QueueScheduler {
  /** Burst throttle floor: drained batches self-reschedule; the floor keeps
   *  a burst from hammering third-party hosts back-to-back. */
  readonly minDelayMs: number
}

export function makeQueueScheduler(options: QueueSchedulerOptions): QueueScheduler {
  const log = getLogger(`${options.name}-scheduler`)
  // 'webmentions.outbox' → 'Webmention outbox' (the batch log line prefix).
  const label = `Webmention ${options.name.slice('webmentions.'.length)}`

  function nextDelayMs(): number | null {
    const due = options.findNextDueAt(jobDb())
    if (due === null) {
      // Nothing due: suspend; enqueues nudge the seam (outbox/inbox), and the
      // seam's periodic re-evaluation picks up new rows regardless.
      return null
    }
    if (due === 'now') {
      return queue.minDelayMs
    }
    return Math.max(due.getTime() - Date.now(), queue.minDelayMs)
  }

  async function run(): Promise<void> {
    const processed = await options.runBatch(jobDb())
    if (processed > 0) {
      log.info(`${label} batch processed`, { processed })
    }
  }

  registerJob({
    name: options.name,
    nextDelayMs,
    run,
  })

  const queue: QueueScheduler = {
    minDelayMs: 1_000,
  }
  return queue
}
