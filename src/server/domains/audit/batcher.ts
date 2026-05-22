import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { from as copyFrom } from 'pg-copy-streams'

import type { AuditEventInput, BatcherOptions } from '@/server/domains/audit/types'

import { csvEscape } from '@/server/domains/audit/csv'
import { db, getRawPool } from '@/server/infra/db/pool'
import { auditLog } from '@/server/infra/db/schema'
import { getLogger } from '@/server/infra/logger'
import { registerShutdownHook } from '@/server/infra/shutdown'

const log = getLogger('audit.batcher')

// Column order is wire-significant — `COPY (col1, col2, ...) FROM
// STDIN` parses positional CSV, so this list MUST match the order
// `csvRow()` emits below and the column types declared on the
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

// ---------------------------------------------------------------------------
// AuditLogBatcher — in-memory buffer + COPY FROM STDIN
//
// Same flush-trigger contract as AccessLogBatcher:
//   - Buffer length reaches flushThreshold
//   - flushIntervalMs elapses since the first push after the last flush
//   - Process receives SIGTERM / SIGINT / beforeExit
//
// Key difference from AccessLogBatcher:
//   - On flush failure, falls back to per-row INSERT instead of dropping
//     the batch (audit rows must not be lost).
// ---------------------------------------------------------------------------

class AuditLogBatcher {
  private buffer: AuditEventInput[] = []
  private timer: NodeJS.Timeout | null = null
  private flushing: Promise<void> | null = null

  constructor(private readonly opts: BatcherOptions) {
    registerShutdownHook(() => this.flush())
  }

  push(event: AuditEventInput): void {
    this.buffer.push({ ...event, createdAt: event.createdAt ?? new Date() })

    if (this.buffer.length >= this.opts.flushThreshold) {
      void this.flush()
      return
    }

    if (this.timer === null) {
      this.timer = setTimeout(() => {
        void this.flush()
      }, this.opts.flushIntervalMs)
      this.timer.unref?.()
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      return this.flushing
    }
    if (this.buffer.length === 0) {
      return
    }

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const snapshot = this.buffer
    this.buffer = []

    this.flushing = (async () => {
      try {
        await copyEvents(snapshot)
        log.debug('flushed audit log via COPY', { count: snapshot.length })
      } catch (err) {
        log.error('COPY failed; falling back to per-row INSERT', {
          err: err instanceof Error ? err.message : String(err),
          count: snapshot.length,
        })
        await insertPerRow(snapshot)
      } finally {
        this.flushing = null
      }
    })()

    return this.flushing
  }
}

async function copyEvents(events: AuditEventInput[]): Promise<void> {
  const pool = getRawPool()
  const client = await pool.connect()
  try {
    const sql = `COPY audit_log (${COPY_COLUMNS.join(', ')}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`
    const stream = client.query(copyFrom(sql))
    const source = Readable.from(events.map(csvRow))
    await pipeline(source, stream)
  } finally {
    client.release()
  }
}

// CSV escaper compatible with Postgres' `COPY ... WITH (FORMAT csv,
// NULL '\N')`. `null`/`undefined` columns become `\N`; everything else
// is stringified and quoted iff it contains a delimiter (comma) or a
// CSV-special character (quote / newline / carriage return). Embedded
// quotes are doubled. Returns a single line terminated by `\n` so the
// upstream `Readable.from(events.map(csvRow))` can fan rows through
// the COPY stream one at a time.
function csvRow(e: AuditEventInput): string {
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

// ---------------------------------------------------------------------------
// Fallback — per-row INSERT via Drizzle (slower but maximally safe)
// ---------------------------------------------------------------------------

async function insertPerRow(events: AuditEventInput[]): Promise<void> {
  // Fast path: try a single batch insert first.
  try {
    await db.insert(auditLog).values(
      events.map((e) => ({
        action: e.action,
        actorId: e.actorId === null || e.actorId === undefined ? null : BigInt(e.actorId),
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
  let successCount = 0
  let failCount = 0

  for (const e of events) {
    try {
      await db.insert(auditLog).values({
        action: e.action,
        actorId: e.actorId === null || e.actorId === undefined ? null : BigInt(e.actorId),
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
      failCount++
      log.error('single-row audit insert failed; dropping row', {
        action: e.action,
        err: rowErr instanceof Error ? rowErr.message : String(rowErr),
      })
    }
  }

  if (failCount > 0) {
    log.warn('per-row fallback completed', { successCount, failCount })
  }
}

// ---------------------------------------------------------------------------
// Singleton — global batcher instance
// ---------------------------------------------------------------------------

const GLOBAL_KEY = Symbol.for('yufan.me/audit-batcher')

function getGlobalSingleton<T>(key: symbol, factory: () => T): T {
  const g = globalThis as unknown as Record<symbol, T | undefined>
  if (g[key] === undefined) {
    g[key] = factory()
  }
  return g[key] as T
}

function getBatcher(): AuditLogBatcher {
  return getGlobalSingleton(
    GLOBAL_KEY,
    () =>
      new AuditLogBatcher({
        flushIntervalMs: 500,
        flushThreshold: 50,
      }),
  )
}

export function pushAuditEvent(event: AuditEventInput): void {
  getBatcher().push(event)
}

export function flushAuditLog(): Promise<void> {
  return getBatcher().flush()
}
