import type { AuditEventInput } from '@/server/domains/audit/types'
import type { Database } from '@/server/infra/db/database'

import { getBatcher, registerBatcher, requireBatcher } from '@/server/infra/db/batcher-registry'
import {
  deserializeDeadLetterJsonLine,
  type FlushResult,
  InsertBatcher,
  replayDeadLetter,
  serializeDeadLetterJsonLines,
  writeDeadLetter,
} from '@/server/infra/db/insert-batcher'
import { auditLog } from '@/server/infra/db/schema/config'
import { getLogger } from '@/server/infra/logger'
import { AUDIT_DEAD_LETTER_PATH } from '@/server/infra/paths'
import { idFromString } from '@/shared/utils/id'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('audit.batcher')

const BATCHER_NAME = 'AuditLogBatcher'

function deadLetterPath(): string {
  return AUDIT_DEAD_LETTER_PATH
}

function serializeForDeadLetter(events: AuditEventInput[]): string {
  return serializeDeadLetterJsonLines(events)
}

function deserializeFromDeadLetter(line: string): AuditEventInput | null {
  return deserializeDeadLetterJsonLine(line, (raw) => {
    if (typeof raw.createdAt === 'number') {
      raw.createdAt = new Date(raw.createdAt)
    }
    return unsafeCast<AuditEventInput>(raw)
  })
}

function toRow(e: AuditEventInput) {
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
    db.insert(auditLog).values(events.map(toRow)).run()
  }

  // On batch failure, fall back to per-row INSERT (audit rows must not
  // be lost). Remaining failures after per-row go to dead-letter.
  protected async onInsertFailed(events: AuditEventInput[], _error: unknown): Promise<FlushResult> {
    return insertPerRow(this.auditDb, events)
  }
}

// Fallback — per-row INSERT via Drizzle (slower but maximally safe).
async function insertPerRow(db: Database, events: AuditEventInput[]): Promise<FlushResult> {
  const failedEvents: AuditEventInput[] = []
  let successCount = 0

  for (const e of events) {
    try {
      db.insert(auditLog).values(toRow(e)).run()
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
    await writeDeadLetter(failedEvents, serializeForDeadLetter, deadLetterPath(), log)
  }

  return { committed: successCount, deadLettered: failedEvents.length }
}

// Self-register on the infra batching seam: the bootstrap lifecycle
// drives init/flush/reset through the registry (`initAllBatchers` /
// `flushAllBatchers` / `resetAllBatchers`) with no per-domain calls.
registerBatcher(BATCHER_NAME, (handle) => new AuditLogBatcher(handle.db))

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
