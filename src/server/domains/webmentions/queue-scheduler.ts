import type { Database } from '@/server/infra/db/database'
import type { Logger } from '@/server/infra/logger'

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

// The per-row error-isolation invariant, defined exactly once: a row must
// never kill the batch. Each queue supplies only its picker and row handler;
// `onRowError` is the escape hatch for post-throw recovery that must keep
// the batch alive (the outbox counts a thrown row as one retryable attempt
// there) — the hook itself owns not throwing.

export interface RunDueRowsOptions<Row> {
  pick: () => Promise<Row[]>
  handleRow: (row: Row) => Promise<void>
  log: Logger
  rowThrewMessage: string
  onRowError?: (row: Row, error: unknown) => Promise<void>
}

export async function runDueRows<Row extends { id: number | string }>(
  options: RunDueRowsOptions<Row>,
): Promise<number> {
  const rows = await options.pick()
  for (const row of rows) {
    try {
      await options.handleRow(row)
    } catch (error: unknown) {
      // A row must never kill the batch: log and move on; the row stays due.
      options.log.warn(options.rowThrewMessage, { id: row.id, error: String(error) })
      await options.onRowError?.(row, error)
    }
  }
  return rows.length
}
