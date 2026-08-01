import type { Database } from '@/server/infra/db/database'

import { runWebmentionOutboxBatch } from '@/server/domains/webmentions/outbox'
import { findNextWebmentionOutboxDueAt } from '@/server/infra/db/operations/webmention-outbox'
import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('webmentions.outbox-scheduler')

// The db getter is injected by the composition root
// (`@/server/bootstrap/db-lifecycle`, which imports this module) at wire
// time — same injection discipline as `wireScheduledPublishScheduler`:
// the getter is invoked when the job evaluates, so a recreated handle
// (restore completion) is picked up without being captured in module
// state.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireWebmentionOutboxScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

// Burst throttle: a just-published post can enqueue up to
// MAX_OUTBOUND_LINKS_PER_POST rows, all due at once — the worker drains
// them OUTBOX_BATCH_SIZE at a time and each drained batch makes the next
// one due 'now'. Without a floor the self-rescheduling seam would fire
// back-to-back setTimeout(0)s and the whole burst would hit third-party
// hosts as fast as the round-trips allow. One second is prompt for the
// first send and spaces the burst out.
export const OUTBOX_MIN_DELAY_MS = 1_000

function nextWebmentionOutboxDelayMs(): number | null {
  if (!resolveDb) {
    // Suspended until the composition root wires the db getter — the seam
    // re-evaluates periodically, so wiring late still takes effect.
    return null
  }
  const due = findNextWebmentionOutboxDueAt(resolveDb())
  if (due === null) {
    // Nothing pending: suspend. Every enqueue nudges
    // `rescheduleWebmentionOutbox`, so a fresh row arms the timer promptly.
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

/**
 * Nudge from the enqueue path (post publish hook) — new rows are due
 * immediately (`next_retry_at NULL`), so the timer should fire within the
 * throttle floor rather than at the previously computed waterline. No-op
 * until the composition root starts the job, so entity mutations in unit
 * tests never arm a real timer.
 */
export function rescheduleWebmentionOutbox(): void {
  job?.reschedule()
}
