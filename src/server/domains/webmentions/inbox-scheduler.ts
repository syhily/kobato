import { runWebmentionInboxBatch } from '@/server/domains/webmentions/inbox'
import { makeQueueScheduler } from '@/server/domains/webmentions/queue-scheduler'
import { findNextWebmentionInboxDueAt } from '@/server/infra/db/operations/webmention-inbox'
import { nudgeRegisteredJob } from '@/server/infra/job-registry'

const queue = makeQueueScheduler({
  name: 'webmentions.inbox',
  task: { key: 'webmention-inbox' },
  findNextDueAt: findNextWebmentionInboxDueAt,
  runBatch: runWebmentionInboxBatch,
})

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const INBOX_MIN_DELAY_MS = queue.minDelayMs

/** Nudge from the enqueue path — new rows are due now. No-op until the
 *  composition root starts the job (unit tests never arm a real timer). */
export function rescheduleWebmentionInbox(): void {
  nudgeRegisteredJob('webmentions.inbox')
}
