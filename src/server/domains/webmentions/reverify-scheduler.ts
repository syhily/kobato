import type { Database } from '@/server/infra/db/database'

import { makeQueueScheduler } from '@/server/domains/webmentions/queue-scheduler'
import { runWebmentionReverifyBatch } from '@/server/domains/webmentions/reverify'
import { findNextWebmentionReverifyDueAt } from '@/server/infra/db/operations/webmention'

const queue = makeQueueScheduler({
  name: 'webmentions.reverify',
  findNextDueAt: findNextWebmentionReverifyDueAt,
  runBatch: runWebmentionReverifyBatch,
})

export function wireWebmentionReverifyScheduler(deps: { getDb: () => Database }): void {
  queue.wire(deps)
}

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const REVERIFY_MIN_DELAY_MS = queue.minDelayMs

export function scheduleWebmentionReverify(): void {
  queue.schedule()
}
