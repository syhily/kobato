import { and, gt, gte, inArray, lt, sql } from 'drizzle-orm'
import { createGzip } from 'node:zlib'

import type { ArchiveResult, CleanupResult } from '@/server/domains/audit/types'
import type { Database } from '@/server/infra/db/database'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { auditLog } from '@/server/infra/db/schema/config'
import { getLogger } from '@/server/infra/logger'
import { backendFor } from '@/server/infra/storage/registry'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { toJsonSafe } from '@/shared/utils/to-json-safe'

const log = getLogger('audit.archive')

const S3_ARCHIVE_PREFIX = 'audit-log/archive/'
const ARCHIVE_PAGE_SIZE = 5000
// Keep IN lists under SQLite's bound-parameter limit (32766).
const DELETE_BATCH_SIZE = 5000

// Strict `isAvailable()` gate: a half-configured bucket falls back to purge-only.
function s3ArchiveAvailable(): boolean {
  try {
    return backendFor('s3').isAvailable()
  } catch {
    return false
  }
}

export async function archiveExpiredAuditLogs(db: Database): Promise<ArchiveResult> {
  const bundle = getBlogSettingsBundleSync()
  const dbRetentionDays = bundle?.limits?.auditLogDbRetentionDays ?? 30

  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - dbRetentionDays)
  cutoff.setHours(0, 0, 0, 0)

  log.info('Starting audit log archive', { cutoff: cutoff.toISOString(), dbRetentionDays })

  if (!s3ArchiveAvailable()) {
    log.warn('S3 storage unavailable; purging expired audit logs without archiving')

    const deleteResult = await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff))
    const deleted = Number(deleteResult.changes)
    log.info('Purge-only mode completed', { deletedRows: deleted })
    return { archivedDays: 0, archivedRows: 0, deletedRows: deleted }
  }

  const dayRows = await db
    .select({
      // createdAt is epoch ms — divide by 1000 for `unixepoch`.
      day: sql<string>`date(${auditLog.createdAt} / 1000, 'unixepoch')`,
      count: sql<number>`count(*)`,
    })
    .from(auditLog)
    .where(lt(auditLog.createdAt, cutoff))
    .groupBy(sql`date(${auditLog.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`date(${auditLog.createdAt} / 1000, 'unixepoch')`)

  if (dayRows.length === 0) {
    log.info('No audit logs to archive')
    return { archivedDays: 0, archivedRows: 0, deletedRows: 0 }
  }

  let archivedDays = 0
  let archivedRows = 0
  let deletedRows = 0

  for (const { day } of dayRows) {
    const dayStart = new Date(`${day}T00:00:00.000Z`)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    try {
      const archived = await archiveDay(db, day, dayStart, dayEnd)
      archivedDays++
      archivedRows += archived
      deletedRows += archived
      log.info('Archived audit log day', { day, rows: archived })
    } catch (err) {
      log.error('Failed to archive audit log day', {
        day,
        err: err instanceof Error ? err.message : String(err),
      })
      // One bad day must not block the rest of the archive.
      continue
    }
  }

  log.info('Audit log archive completed', { archivedDays, archivedRows, deletedRows })
  return { archivedDays, archivedRows, deletedRows }
}

async function archiveDay(db: Database, day: string, dayStart: Date, dayEnd: Date): Promise<number> {
  const key = `${S3_ARCHIVE_PREFIX}${day}.jsonl.gz`

  // Stream pages through gzip to avoid loading everything into memory.
  const gzip = createGzip()
  const chunks: Buffer[] = []

  const gzipDone = new Promise<void>((resolve, reject) => {
    gzip.on('data', (chunk: Buffer) => chunks.push(chunk))
    gzip.on('end', () => resolve())
    gzip.on('error', reject)
  })

  let totalRows = 0
  let cursorId: number | undefined
  const archivedIds: number[] = []

  // Cursor by id — createdAt is not unique.
  for (;;) {
    const conditions = [gte(auditLog.createdAt, dayStart), lt(auditLog.createdAt, dayEnd)]
    if (cursorId) {
      conditions.push(gt(auditLog.id, cursorId))
    }

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(auditLog.createdAt, auditLog.id)
      .limit(ARCHIVE_PAGE_SIZE)

    if (rows.length === 0) {
      break
    }

    // Plain JSON-lines; `toJsonSafe` renders Dates as epoch ms.
    const lines = rows.map((row) =>
      JSON.stringify(
        toJsonSafe({
          id: row.id,
          action: row.action,
          actorId: row.actorId,
          actorRole: row.actorRole,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          details: row.details,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          createdAt: row.createdAt,
        }),
      ),
    )

    gzip.write(lines.join('\n') + '\n')

    for (const row of rows) {
      archivedIds.push(row.id)
    }
    totalRows += rows.length
    if (rows.length < ARCHIVE_PAGE_SIZE) {
      break
    }

    cursorId = rows[rows.length - 1].id
  }

  gzip.end()
  await gzipDone

  const buffer = Buffer.concat(chunks)

  // Idempotency: don't overwrite an existing archive with empty data.
  if (totalRows === 0 || buffer.length === 0) {
    log.info('Skipping empty archive upload', { day, totalRows })
    return 0
  }

  await backendFor('s3').put({ key, body: buffer, contentType: 'application/gzip', visibility: 'private' })

  // Delete only after a successful upload, by the exact collected IDs.
  return deleteArchivedRows(db, archivedIds)
}

/** Batch deletes by id (test seam: production uses DELETE_BATCH_SIZE). */
export async function deleteArchivedRows(
  db: Database,
  ids: readonly number[],
  batchSize = DELETE_BATCH_SIZE,
): Promise<number> {
  let deleted = 0
  for (let start = 0; start < ids.length; start += batchSize) {
    const result = await db.delete(auditLog).where(inArray(auditLog.id, ids.slice(start, start + batchSize)))
    deleted += Number(result.changes)
  }
  return deleted
}

export async function cleanupExpiredArchives(): Promise<CleanupResult> {
  const bundle = getBlogSettingsBundleSync()
  const archiveRetentionDays = bundle?.limits?.auditLogArchiveRetentionDays ?? 180

  if (!s3ArchiveAvailable()) {
    log.info('S3 storage unavailable; skipping expired archive cleanup')
    return { deletedFiles: 0 }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - archiveRetentionDays)

  log.info('Starting S3 archive cleanup', { cutoff: cutoff.toISOString(), archiveRetentionDays })

  const backend = backendFor('s3')
  const objects = await backend.list(S3_ARCHIVE_PREFIX)
  const toDelete = objects.filter((o) => o.lastModified !== undefined && o.lastModified < cutoff).map((o) => o.key)

  if (toDelete.length === 0) {
    log.info('No expired S3 archives to clean up')
    return { deletedFiles: 0 }
  }

  await backend.deleteMany(toDelete)

  log.info('S3 archive cleanup completed', { deletedFiles: toDelete.length })
  return { deletedFiles: toDelete.length }
}

export async function runArchiveJob(db: Database): Promise<void> {
  try {
    const archiveResult = await archiveExpiredAuditLogs(db)
    const cleanupResult = await cleanupExpiredArchives()

    recordAuditEvent({
      action: 'audit_archive_run',
      resourceType: 'audit_log',
      actorId: null,
      actorRole: null,
      details: {
        archivedDays: archiveResult.archivedDays,
        archivedRows: archiveResult.archivedRows,
        deletedRows: archiveResult.deletedRows,
        s3DeletedFiles: cleanupResult.deletedFiles,
      },
    })
  } catch (error) {
    log.error('Archive job failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    recordAuditEvent({
      action: 'audit_archive_run_failed',
      resourceType: 'audit_log',
      actorId: null,
      actorRole: null,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    })
  }
}
