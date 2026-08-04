import type { Database } from '@kobato/server/infra/db/database'

import { runWebmentionReverifyBatch } from '@kobato/server/domains/webmentions/reverify'
import { findNextWebmentionReverifyDueAt } from '@kobato/server/infra/db/operations/webmention'
import { getLogger } from '@kobato/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@kobato/server/infra/scheduler-utils'

const log = getLogger('webmentions.reverify-scheduler')

// The db getter is injected by the composition root
// (`@/server/bootstrap/db-lifecycle`, which imports this module) at wire
// time — same injection discipline as the inbox/outbox schedulers: the
// getter is invoked when the job evaluates, so a recreated handle
// (restore completion) is picked up without being captured in module
// state.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireWebmentionReverifyScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

// Politesse floor: a batch of rows that all crossed their 24h waterline
// at once (an approve burst, a failed receive landing many rows) is
// drained one REVERIFY_BATCH_SIZE at a time with at least a second
// between wake-ups, so third-party source hosts are never hammered
// back-to-back.
export const REVERIFY_MIN_DELAY_MS = 1_000

function nextWebmentionReverifyDelayMs(): number | null {
  if (!resolveDb) {
    // Suspended until the composition root wires the db getter — the seam
    // re-evaluates periodically, so wiring late still takes effect.
    return null
  }
  const due = findNextWebmentionReverifyDueAt(resolveDb())
  if (due === null) {
    // Nothing in the cycle (no approved rows, no pending failures):
    // suspend. An approve or a failed receive-time landing makes a row
    // qualifying again, and the seam's periodic re-evaluation picks it up.
    return null
  }
  if (due === 'now') {
    return REVERIFY_MIN_DELAY_MS
  }
  return Math.max(due.getTime() - Date.now(), REVERIFY_MIN_DELAY_MS)
}

async function runWebmentionReverify(): Promise<void> {
  if (!resolveDb) {
    throw new Error('webmention reverify job fired before wireWebmentionReverifyScheduler')
  }
  const processed = await runWebmentionReverifyBatch(resolveDb())
  if (processed > 0) {
    log.info('Webmention reverify batch processed', { processed })
  }
}

export function scheduleWebmentionReverify(): void {
  job ??= scheduleJob({
    name: 'webmentions.reverify',
    nextDelayMs: nextWebmentionReverifyDelayMs,
    run: runWebmentionReverify,
  })
  job.reschedule()
}
