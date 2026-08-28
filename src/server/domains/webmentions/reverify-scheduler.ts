import { makeQueueScheduler } from '@/server/domains/webmentions/queue-scheduler'
import { runWebmentionReverifyBatch } from '@/server/domains/webmentions/reverify'
import { findNextWebmentionReverifyDueAt } from '@/server/infra/db/operations/webmention'

const queue = makeQueueScheduler({
  name: 'webmentions.reverify',
  task: { key: 'webmention-reverify' },
  findNextDueAt: findNextWebmentionReverifyDueAt,
  runBatch: runWebmentionReverifyBatch,
})

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const REVERIFY_MIN_DELAY_MS = queue.minDelayMs
