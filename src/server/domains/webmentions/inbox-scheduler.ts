import type { Database } from '@/server/infra/db/database'

import { runWebmentionInboxBatch } from '@/server/domains/webmentions/inbox'
import { findNextWebmentionInboxDueAt } from '@/server/infra/db/operations/webmention-inbox'
import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('webmentions.inbox-scheduler')

// Db getter injected by the composition root at wire time; invoked when
// the job evaluates, so a recreated handle (restore) is picked up.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireWebmentionInboxScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const INBOX_MIN_DELAY_MS = 1_000

function nextWebmentionInboxDelayMs(): number | null {
  if (!resolveDb) {
    // Not wired yet; the seam re-evaluates, so wiring late still takes effect.
    return null
  }
  const due = findNextWebmentionInboxDueAt(resolveDb())
  if (due === null) {
    // Nothing due: suspend; enqueues nudge the seam.
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

/** Nudge from the enqueue path — new rows are due now. No-op until the
 *  composition root starts the job (unit tests never arm a real timer). */
export function rescheduleWebmentionInbox(): void {
  job?.reschedule()
}
