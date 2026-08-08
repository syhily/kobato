import type { Database } from '@/server/infra/db/database'

import { runWebmentionOutboxBatch } from '@/server/domains/webmentions/outbox'
import { findNextWebmentionOutboxDueAt } from '@/server/infra/db/operations/webmention-outbox'
import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('webmentions.outbox-scheduler')

// Db getter injected by the composition root at wire time; invoked when
// the job evaluates, so a recreated handle (restore) is picked up.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireWebmentionOutboxScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const OUTBOX_MIN_DELAY_MS = 1_000

function nextWebmentionOutboxDelayMs(): number | null {
  if (!resolveDb) {
    // Not wired yet; the seam re-evaluates, so wiring late still takes effect.
    return null
  }
  const due = findNextWebmentionOutboxDueAt(resolveDb())
  if (due === null) {
    // Nothing due: suspend; enqueues nudge the seam.
    return null
  }
  if (due === 'now') {
    return OUTBOX_MIN_DELAY_MS
  }
  return Math.max(due.getTime() - Date.now(), OUTBOX_MIN_DELAY_MS)
}

async function runWebmentionOutbox(): Promise<void> {
  if (!resolveDb) {
    throw new Error('webmention outbox job fired before wireWebmentionOutboxScheduler')
  }
  const processed = await runWebmentionOutboxBatch(resolveDb())
  if (processed > 0) {
    log.info('Webmention outbox batch processed', { processed })
  }
}

export function scheduleWebmentionOutbox(): void {
  job ??= scheduleJob({
    name: 'webmentions.outbox',
    nextDelayMs: nextWebmentionOutboxDelayMs,
    run: runWebmentionOutbox,
  })
  job.reschedule()
}

/** Nudge from the enqueue path (post publish hook) — new rows are due now.
 *  No-op until the composition root starts the job. */
export function rescheduleWebmentionOutbox(): void {
  job?.reschedule()
}
