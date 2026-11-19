import { findNextWebmentionReverifyDueAt } from '@kobato/db/operations/webmention.ts'
import { makeQueueScheduler } from '@kobato/server/domains/webmentions/queue-scheduler.ts'
import { runWebmentionReverifyBatch } from '@kobato/server/domains/webmentions/reverify.ts'

const queue = makeQueueScheduler({
  name: 'webmentions.reverify',
  task: { key: 'webmention-reverify' },
  findNextDueAt: findNextWebmentionReverifyDueAt,
  runBatch: runWebmentionReverifyBatch,
})

export const REVERIFY_MIN_DELAY_MS = queue.minDelayMs
