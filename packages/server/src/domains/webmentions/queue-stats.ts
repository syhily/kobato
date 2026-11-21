import type { QueueTaskStatsDto } from '@kobato/api/contracts/jobs'
import type { Database } from '@kobato/db/database'

import { findNextWebmentionReverifyDueAt } from '@kobato/db/operations/webmention'
import { countWebmentionInbox, findNextWebmentionInboxDueAt } from '@kobato/db/operations/webmention-inbox'
import { countWebmentionOutboxByStatus, findNextWebmentionOutboxDueAt } from '@kobato/db/operations/webmention-outbox'

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
