import { findNextWebmentionOutboxDueAt } from '../../infra/db/operations/webmention-outbox'
import { nudgeRegisteredJob } from '../../infra/job-registry'
import { runWebmentionOutboxBatch } from './outbox'
import { makeQueueScheduler } from './queue-scheduler'

const queue = makeQueueScheduler({
  name: 'webmentions.outbox',
  task: { key: 'webmention-outbox' },
  findNextDueAt: findNextWebmentionOutboxDueAt,
  runBatch: runWebmentionOutboxBatch,
})

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const OUTBOX_MIN_DELAY_MS = queue.minDelayMs

/** Nudge from the enqueue path (post publish hook) — new rows are due now.
 *  No-op until the composition root starts the job. */
export function rescheduleWebmentionOutbox(): void {
  nudgeRegisteredJob('webmentions.outbox')
}
