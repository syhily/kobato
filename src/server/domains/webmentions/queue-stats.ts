import type { Database } from '@/server/infra/db/database'
import type { QueueTaskStatsDto } from '@/shared/contracts/jobs'

import { findNextWebmentionReverifyDueAt } from '@/server/infra/db/operations/webmention'
import { countWebmentionInbox, findNextWebmentionInboxDueAt } from '@/server/infra/db/operations/webmention-inbox'
import {
  countWebmentionOutboxByStatus,
  findNextWebmentionOutboxDueAt,
} from '@/server/infra/db/operations/webmention-outbox'

// Queue-depth stats backing the admin task center (`admin.jobs.list`) — one
// branch per webmention queue task; non-queue tasks get null.

/** `'now'` surfaces as the current instant — the queue is due immediately. */
function dueAtToIso(due: Date | 'now' | null): string | null {
  if (due === null) {
    return null
  }
  return (due === 'now' ? new Date() : due).toISOString()
}

export async function queueTaskStats(db: Database, taskKey: string): Promise<QueueTaskStatsDto | null> {
  if (taskKey === 'webmention-outbox') {
    const counts = await countWebmentionOutboxByStatus(db)
    return {
      depth: counts.pending,
      nextDueAt: dueAtToIso(findNextWebmentionOutboxDueAt(db)),
      attentionCount: counts.failed + counts['no-endpoint'],
    }
  }
  if (taskKey === 'webmention-inbox') {
    const counts = await countWebmentionInbox(db)
    return {
      depth: counts.depth,
      nextDueAt: dueAtToIso(findNextWebmentionInboxDueAt(db)),
      attentionCount: counts.attention,
    }
  }
  if (taskKey === 'webmention-reverify') {
    return { depth: 0, nextDueAt: dueAtToIso(findNextWebmentionReverifyDueAt(db)), attentionCount: null }
  }
  return null
}
