import { findNextWebmentionOutboxDueAt } from '@kobato/db/operations/webmention-outbox.ts'
import { runWebmentionOutboxBatch } from '@kobato/server/domains/webmentions/outbox.ts'
import { makeQueueScheduler } from '@kobato/server/domains/webmentions/queue-scheduler.ts'
import { nudgeRegisteredJob } from '@kobato/server/infra/job-registry.ts'

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
