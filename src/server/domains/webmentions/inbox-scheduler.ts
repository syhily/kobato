import type { Database } from '@/server/infra/db/database'

import { runWebmentionInboxBatch } from '@/server/domains/webmentions/inbox'
import { findNextWebmentionInboxDueAt } from '@/server/infra/db/operations/webmention-inbox'
import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('webmentions.inbox-scheduler')

// The db getter is injected by the composition root
// (`@/server/bootstrap/db-lifecycle`, which imports this module) at wire
// time — same injection discipline as `wireWebmentionOutboxScheduler`:
// the getter is invoked when the job evaluates, so a recreated handle
// (restore completion) is picked up without being captured in module
// state.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireWebmentionInboxScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

// Burst throttle: a mention burst can enqueue many rows, all due at
// once — the worker drains them INBOX_BATCH_SIZE at a time and each
// drained batch makes the next one due 'now'. Without a floor the
// self-rescheduling seam would fire back-to-back setTimeout(0)s and the
// whole burst would hit third-party source hosts as fast as the
// round-trips allow. One second is prompt for the first verification
// and spaces the burst out.
export const INBOX_MIN_DELAY_MS = 1_000

function nextWebmentionInboxDelayMs(): number | null {
  if (!resolveDb) {
    // Suspended until the composition root wires the db getter — the seam
    // re-evaluates periodically, so wiring late still takes effect.
    return null
  }
  const due = findNextWebmentionInboxDueAt(resolveDb())
  if (due === null) {
    // Nothing queued: suspend. Every enqueue nudges
    // `rescheduleWebmentionInbox`, so a fresh row arms the timer promptly.
    return null
  }
  if (due === 'now') {
    return INBOX_MIN_DELAY_MS
  }
  return Math.max(due.getTime() - Date.now(), INBOX_MIN_DELAY_MS)
}

async function runWebmentionInbox(): Promise<void> {
  if (!resolveDb) {
    throw new Error('webmention inbox job fired before wireWebmentionInboxScheduler')
  }
  const processed = await runWebmentionInboxBatch(resolveDb())
  if (processed > 0) {
    log.info('Webmention inbox batch processed', { processed })
  }
}

export function scheduleWebmentionInbox(): void {
  job ??= scheduleJob({
    name: 'webmentions.inbox',
    nextDelayMs: nextWebmentionInboxDelayMs,
    run: runWebmentionInbox,
  })
  job.reschedule()
}

/**
 * Nudge from the enqueue path (the /webmention endpoint) — new rows are
 * due immediately (`next_retry_at NULL`), so the timer should fire
 * within the throttle floor rather than at the previously computed
 * waterline. No-op until the composition root starts the job, so the
 * endpoint in unit tests never arms a real timer.
 */
export function rescheduleWebmentionInbox(): void {
  job?.reschedule()
}
