import { findNextWebmentionReverifyDueAt } from '@kobato/db/sqlite/operations/engagement/webmention-verification'
import { makeQueueScheduler } from '@kobato/server/domains/webmentions/queue-scheduler'
import { runWebmentionReverifyBatch } from '@kobato/server/domains/webmentions/reverify'

const queue = makeQueueScheduler({
  name: 'webmentions.reverify',
  task: { key: 'webmention-reverify' },
  findNextDueAt: findNextWebmentionReverifyDueAt,
  runBatch: runWebmentionReverifyBatch,
})

export const REVERIFY_MIN_DELAY_MS = queue.minDelayMs
