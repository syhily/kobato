import { findNextWebmentionInboxDueAt } from '@kobato/db/operations/webmention-inbox.ts'
import { runWebmentionInboxBatch } from '@kobato/server/domains/webmentions/inbox.ts'
import { makeQueueScheduler } from '@kobato/server/domains/webmentions/queue-scheduler.ts'
import { nudgeRegisteredJob } from '@kobato/server/infra/job-registry.ts'

const queue = makeQueueScheduler({
  name: 'webmentions.inbox',
  task: { key: 'webmention-inbox' },
  findNextDueAt: findNextWebmentionInboxDueAt,
  runBatch: runWebmentionInboxBatch,
})

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const INBOX_MIN_DELAY_MS = queue.minDelayMs

export function rescheduleWebmentionInbox(): void {
  nudgeRegisteredJob('webmentions.inbox')
}
