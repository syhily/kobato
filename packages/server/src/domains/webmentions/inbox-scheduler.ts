import { findNextWebmentionInboxDueAt } from '@kobato/db/operations/webmention-inbox'
import { runWebmentionInboxBatch } from '@kobato/server/domains/webmentions/inbox'
import { makeQueueScheduler } from '@kobato/server/domains/webmentions/queue-scheduler'
import { nudgeRegisteredJob } from '@kobato/server/infra/job-registry'

const queue = makeQueueScheduler({
  name: 'webmentions.inbox',
  task: { key: 'webmention-inbox' },
  findNextDueAt: findNextWebmentionInboxDueAt,
  runBatch: runWebmentionInboxBatch,
})

export const INBOX_MIN_DELAY_MS = queue.minDelayMs

export function rescheduleWebmentionInbox(): void {
  nudgeRegisteredJob('webmentions.inbox')
}
