import type { Database } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

// Single owner of the webmention queue-loop mechanics; the outbox / inbox /
// reverify scheduler modules were line-for-line clones of this. They keep
// their own exported seams (wire*/schedule*/reschedule*) and supply policy
// through the closures below — `name` must stay `webmentions.<queue>`: the
// logger scope, the batch log line, and the pre-wire error derive from it.

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
  wire(deps: { getDb: () => Database }): void
  schedule(): void
  /** Nudge from the enqueue path — new rows are due now. No-op until the
   *  composition root starts the job (unit tests never arm a real timer). */
  reschedule(): void
}

export function makeQueueScheduler(options: QueueSchedulerOptions): QueueScheduler {
  const log = getLogger(`${options.name}-scheduler`)
  // 'webmentions.outbox' → 'Webmention outbox' (the batch log line prefix).
  const label = `Webmention ${options.name.slice('webmentions.'.length)}`

  // Db getter injected by the composition root at wire time; invoked when
  // the job evaluates, so a recreated handle (restore) is picked up.
  let resolveDb: (() => Database) | null = null
  let job: ScheduledJob | null = null

  function nextDelayMs(): number | null {
    if (!resolveDb) {
      // Not wired yet; the seam re-evaluates, so wiring late still takes effect.
      return null
    }
    const due = options.findNextDueAt(resolveDb())
    if (due === null) {
      // Nothing due: suspend; enqueues nudge the seam (outbox/inbox), and the
      // seam's periodic re-evaluation picks up new rows regardless.
      return null
    }
    if (due === 'now') {
      return scheduler.minDelayMs
    }
    return Math.max(due.getTime() - Date.now(), scheduler.minDelayMs)
  }

  async function run(): Promise<void> {
    if (!resolveDb) {
      throw new Error(`${options.name} job fired before its wire*Scheduler call`)
    }
    const processed = await options.runBatch(resolveDb())
    if (processed > 0) {
      log.info(`${label} batch processed`, { processed })
    }
  }

  const scheduler: QueueScheduler = {
    minDelayMs: 1_000,
    wire(deps) {
      resolveDb = deps.getDb
    },
    schedule() {
      job ??= scheduleJob({
        name: options.name,
        nextDelayMs,
        run,
      })
      job.reschedule()
    },
    reschedule() {
      job?.reschedule()
    },
  }
  return scheduler
}
