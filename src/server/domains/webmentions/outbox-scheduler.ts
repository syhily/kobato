import type { Database } from '@/server/infra/db/database'

import { runWebmentionOutboxBatch } from '@/server/domains/webmentions/outbox'
import { makeQueueScheduler } from '@/server/domains/webmentions/queue-scheduler'
import { findNextWebmentionOutboxDueAt } from '@/server/infra/db/operations/webmention-outbox'

const queue = makeQueueScheduler({
  name: 'webmentions.outbox',
  findNextDueAt: findNextWebmentionOutboxDueAt,
  runBatch: runWebmentionOutboxBatch,
})

export function wireWebmentionOutboxScheduler(deps: { getDb: () => Database }): void {
  queue.wire(deps)
}

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const OUTBOX_MIN_DELAY_MS = queue.minDelayMs

export function scheduleWebmentionOutbox(): void {
  queue.schedule()
}

/** Nudge from the enqueue path (post publish hook) — new rows are due now.
 *  No-op until the composition root starts the job. */
export function rescheduleWebmentionOutbox(): void {
  queue.reschedule()
}
