import type { Database } from '@/server/infra/db/database'

import { runWebmentionReverifyBatch } from '@/server/domains/webmentions/reverify'
import { findNextWebmentionReverifyDueAt } from '@/server/infra/db/operations/webmention'
import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('webmentions.reverify-scheduler')

// Db getter injected by the composition root at wire time; invoked when
// the job evaluates, so a recreated handle (restore) is picked up.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireWebmentionReverifyScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

// Burst throttle: drained batches self-reschedule; the floor keeps a
// burst from hammering third-party hosts back-to-back.
export const REVERIFY_MIN_DELAY_MS = 1_000

function nextWebmentionReverifyDelayMs(): number | null {
  if (!resolveDb) {
    // Not wired yet; the seam re-evaluates, so wiring late still takes effect.
    return null
  }
  const due = findNextWebmentionReverifyDueAt(resolveDb())
  if (due === null) {
    // Nothing due: suspend; the seam's periodic re-evaluation picks up new rows.
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
