import type { Database } from '@kobato/db/sqlite/database'
import type { NewAuditLog } from '@kobato/db/sqlite/types'
import type { AuditEventInput } from '@kobato/server/domains/audit/types'

import { idFromString } from '@kobato/base/utils/id'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { databaseOf } from '@kobato/db/sqlite/database'
import { insertAuditLogRows } from '@kobato/db/sqlite/operations/system/audit-log'
import { AUDIT_DEAD_LETTER_PATH } from '@kobato/server/infra/data-paths'
import { getBatcher, registerBatcher, requireBatcher } from '@kobato/server/infra/db/batcher-registry'
import {
  deserializeDeadLetterJsonLine,
  type FlushResult,
  InsertBatcher,
  replayDeadLetter,
  serializeDeadLetterJsonLines,
  writeDeadLetter,
} from '@kobato/server/infra/db/insert-batcher'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('audit.batcher')

const BATCHER_NAME = 'AuditLogBatcher'

function deadLetterPath(): string {
  return AUDIT_DEAD_LETTER_PATH
}

function deserializeFromDeadLetter(line: string): AuditEventInput | null {
  return deserializeDeadLetterJsonLine(line, (raw) => {
    if (typeof raw.createdAt === 'number') {
      raw.createdAt = new Date(raw.createdAt)
    }
    return unsafeCast<AuditEventInput>(raw)
  })
}

function toRow(e: AuditEventInput): NewAuditLog {
  return {
    action: e.action,
    actorId: e.actorId === null || e.actorId === undefined ? null : idFromString(e.actorId),
    actorRole: e.actorRole ?? null,
    resourceType: e.resourceType,
    resourceId: e.resourceId ?? null,
    details: e.details ?? null,
    ipAddress: e.ipAddress ?? null,
    userAgent: e.userAgent ?? null,
    createdAt: e.createdAt ?? new Date(),
  }
}

class AuditLogBatcher extends InsertBatcher<AuditEventInput> {
  constructor(private readonly auditDb: Database) {
    super({ flushIntervalMs: 500, flushThreshold: 50 }, 'audit.batcher', () => auditDb)
  }

  protected insertBatch(db: Database, events: AuditEventInput[]): void {
    insertAuditLogRows(db, events.map(toRow))
  }

  protected async onInsertFailed(events: AuditEventInput[], _error: unknown): Promise<FlushResult> {
    return insertPerRow(this.auditDb, events)
  }
}

async function insertPerRow(db: Database, events: AuditEventInput[]): Promise<FlushResult> {
  const failedEvents: AuditEventInput[] = []
  let successCount = 0

  for (const e of events) {
    try {
      insertAuditLogRows(db, [toRow(e)])
      successCount++
    } catch (rowErr) {
      failedEvents.push(e)
      log.error('single-row audit insert failed; queueing for dead-letter', {
        action: e.action,
        err: rowErr instanceof Error ? rowErr.message : String(rowErr),
      })
    }
  }

  if (failedEvents.length > 0) {
    log.warn('per-row fallback completed; writing failures to dead-letter', {
      successCount,
      failCount: failedEvents.length,
    })
    await writeDeadLetter(failedEvents, serializeDeadLetterJsonLines, deadLetterPath(), log)
  }

  return { committed: successCount, deadLettered: failedEvents.length }
}

registerBatcher(BATCHER_NAME, (handle) => new AuditLogBatcher(databaseOf(handle)), {
  replayDeadLetter: () => replayDeadLetterAuditLog(),
})

export function pushAuditEvent(event: AuditEventInput): void {
  requireBatcher<AuditLogBatcher>(BATCHER_NAME).push(event)
}

export function flushAuditLog(): Promise<FlushResult> {
  const batcher = getBatcher<AuditLogBatcher>(BATCHER_NAME)
  if (!batcher) {
    return Promise.resolve({ committed: 0, deadLettered: 0 })
  }
  return batcher.flush()
}

export async function replayDeadLetterAuditLog(path?: string): Promise<{ replayed: number; failed: number }> {
  const batcher = requireBatcher<AuditLogBatcher>(BATCHER_NAME)
  return replayDeadLetter(path ?? deadLetterPath(), deserializeFromDeadLetter, (events) => batcher.ingest(events), log)
}
