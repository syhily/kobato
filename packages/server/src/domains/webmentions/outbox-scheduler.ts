import { findNextWebmentionOutboxDueAt } from '@kobato/db/sqlite/operations/engagement/webmention-outbox'
import { runWebmentionOutboxBatch } from '@kobato/server/domains/webmentions/outbox'
import { makeQueueScheduler } from '@kobato/server/domains/webmentions/queue-scheduler'
import { nudgeRegisteredJob } from '@kobato/server/infra/job-registry'

const queue = makeQueueScheduler({
  name: 'webmentions.outbox',
  task: { key: 'webmention-outbox' },
  findNextDueAt: findNextWebmentionOutboxDueAt,
  runBatch: runWebmentionOutboxBatch,
})

export const OUTBOX_MIN_DELAY_MS = queue.minDelayMs

export function rescheduleWebmentionOutbox(): void {
  nudgeRegisteredJob('webmentions.outbox')
}
