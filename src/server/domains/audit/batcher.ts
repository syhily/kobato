import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import type { AuditEventInput } from '@/server/domains/audit/types'

import { csvEscape } from '@/server/infra/csv'
import { CopyBatcher, replayDeadLetter, writeDeadLetter } from '@/server/infra/db/copy-batcher'
import { auditLog } from '@/server/infra/db/schema/config'
import { AUDIT_DEAD_LETTER_PATH } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

const log = getLogger('audit.batcher')

const DEAD_LETTER_SEP = '\n'

function deadLetterPath(): string {
  return AUDIT_DEAD_LETTER_PATH ?? '/tmp/kobato-audit-dead-letter.jsonl'
}

function serializeForDeadLetter(events: AuditEventInput[]): string {
  return (
    events
      .map((e) =>
        JSON.stringify({
          ...e,
          createdAt: (e.createdAt ?? new Date()).toISOString(),
        }),
      )
      .join(DEAD_LETTER_SEP) + DEAD_LETTER_SEP
  )
}

function deserializeFromDeadLetter(line: string): AuditEventInput | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>
    return {
      action: raw.action as string,
      actorId: raw.actorId as string | null | undefined,
      actorRole: raw.actorRole as string | null | undefined,
      resourceType: raw.resourceType as string,
      resourceId: raw.resourceId as string | null | undefined,
      details: raw.details === null ? undefined : (raw.details as Record<string, unknown> | undefined),
      ipAddress: raw.ipAddress as string | null | undefined,
      userAgent: raw.userAgent as string | null | undefined,
      createdAt: raw.createdAt === undefined ? undefined : new Date(raw.createdAt as string),
    }
  } catch {
    return null
  }
}

// Column order is wire-significant — `COPY (col1, col2, ...) FROM
// STDIN` parses positional CSV, so this list MUST match the order
// `toCsvRow()` emits below and the column types declared on the
// Drizzle `auditLog` table (`@/server/infra/db/schema.ts`).
const COPY_COLUMNS = [
  'action',
  'actor_id',
  'actor_role',
  'resource_type',
  'resource_id',
  'details',
  'ip_address',
  'user_agent',
  'created_at',
] as const

class AuditLogBatcher extends CopyBatcher<AuditEventInput> {
  private db: NodePgDatabase

  constructor(db: NodePgDatabase, pool: Pool) {
    super({ flushIntervalMs: 500, flushThreshold: 50 }, 'audit_log', COPY_COLUMNS, 'audit.batcher', pool)
    this.db = db
  }

  protected toCsvRow(e: AuditEventInput): string {
    const now = (e.createdAt ?? new Date()).toISOString()
    const cols = [
      e.action,
      e.actorId === null || e.actorId === undefined ? null : String(e.actorId),
      e.actorRole ?? null,
      e.resourceType,
      e.resourceId ?? null,
      e.details === null || e.details === undefined ? null : JSON.stringify(e.details),
      e.ipAddress ?? null,
      e.userAgent ?? null,
      now,
    ]
    return cols.map(csvEscape).join(',') + '\n'
  }

  // On COPY failure, fall back to per-row INSERT (audit rows must not
  // be lost). Remaining failures after per-row go to dead-letter.
  protected async onCopyFailed(events: AuditEventInput[]): Promise<void> {
    await insertPerRow(this.db, events)
  }
}

// ---------------------------------------------------------------------------
// Fallback — per-row INSERT via Drizzle (slower but maximally safe)
// ---------------------------------------------------------------------------

async function insertPerRow(db: NodePgDatabase, events: AuditEventInput[]): Promise<void> {
  // Fast path: try a single batch insert first.
  try {
    await db.insert(auditLog).values(
      events.map((e) => ({
        action: e.action,
        actorId:
          e.actorId === null || e.actorId === undefined
            ? null
            : typeof e.actorId === 'bigint'
              ? e.actorId
              : idFromString(e.actorId),
        actorRole: e.actorRole ?? null,
        resourceType: e.resourceType,
        resourceId: e.resourceId ?? null,
        details: e.details ?? null,
        ipAddress: e.ipAddress ?? null,
        userAgent: e.userAgent ?? null,
        createdAt: e.createdAt ?? new Date(),
      })),
    )
    return
  } catch (batchErr) {
    log.warn('batch insert failed; falling back to per-row', {
      err: batchErr instanceof Error ? batchErr.message : String(batchErr),
      count: events.length,
    })
  }

  // Slow path: per-row with individual error handling.
  const failedEvents: AuditEventInput[] = []
  let successCount = 0

  for (const e of events) {
    try {
      await db.insert(auditLog).values({
        action: e.action,
        actorId:
          e.actorId === null || e.actorId === undefined
            ? null
            : typeof e.actorId === 'bigint'
              ? e.actorId
              : idFromString(e.actorId),
        actorRole: e.actorRole ?? null,
        resourceType: e.resourceType,
        resourceId: e.resourceId ?? null,
        details: e.details ?? null,
        ipAddress: e.ipAddress ?? null,
        userAgent: e.userAgent ?? null,
        createdAt: e.createdAt ?? new Date(),
      })
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
}

// ---------------------------------------------------------------------------
// Singleton — global batcher instance
// ---------------------------------------------------------------------------

let batcher: AuditLogBatcher | undefined

export function initAuditLogBatcher(db: NodePgDatabase, pool: Pool): void {
  batcher = new AuditLogBatcher(db, pool)
}

export function resetAuditLogBatcher(): void {
  batcher = undefined
}

function requireBatcher(): AuditLogBatcher {
  if (!batcher) {
    throw new Error('AuditLogBatcher not initialized — call initAuditLogBatcher(db, pool) first')
  }
  return batcher
}

export function pushAuditEvent(event: AuditEventInput): void {
  requireBatcher().push(event)
}

export function flushAuditLog(): Promise<void> {
  if (!batcher) {
    return Promise.resolve()
  }
  return batcher.flush()
}

export async function replayDeadLetterAuditLog(path?: string): Promise<{ replayed: number; failed: number }> {
  if (!batcher) {
    throw new Error('AuditLogBatcher not initialized — call initAuditLogBatcher(db, pool) first')
  }
  const b = batcher
  return replayDeadLetter(path ?? deadLetterPath(), deserializeFromDeadLetter, async (events) => b.ingest(events), log)
}
