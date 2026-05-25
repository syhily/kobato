import { and, gt, gte, lt, sql } from 'drizzle-orm'
import { createGzip } from 'node:zlib'

import type { ArchiveResult, CleanupResult } from '@/server/domains/audit/types'

import { recordAuditEvent } from '@/server/domains/audit/service'
import { db } from '@/server/infra/db/pool'
import { auditLog } from '@/server/infra/db/schema/config'
import { getLogger } from '@/server/infra/logger'
import { deleteS3Objects, listS3Objects, putS3Object } from '@/server/infra/storage/s3-client'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('audit.archive')

const S3_ARCHIVE_PREFIX = 'audit-log/archive/'
const ARCHIVE_PAGE_SIZE = 5000

// ---------------------------------------------------------------------------
// Archive expired audit logs to S3
// ---------------------------------------------------------------------------

export async function archiveExpiredAuditLogs(): Promise<ArchiveResult> {
  const bundle = getBlogSettingsBundleSync()
  const dbRetentionDays = bundle?.limits?.auditLogDbRetentionDays ?? 30

  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - dbRetentionDays)
  cutoff.setHours(0, 0, 0, 0)

  log.info('Starting audit log archive', { cutoff: cutoff.toISOString(), dbRetentionDays })

  // If S3 is not configured, fall back to purge-only mode so expired rows
  // do not accumulate indefinitely in Postgres.
  const storage = bundle?.assets?.storage
  const s3Available = storage?.enabled === true && storage.secretAccessKey !== ''
  if (!s3Available) {
    log.warn('S3 storage unavailable; purging expired audit logs without archiving')

    const deleteResult = await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff))
    const deleted = Number(deleteResult.rowCount ?? 0)
    log.info('Purge-only mode completed', { deletedRows: deleted })
    return { archivedDays: 0, archivedRows: 0, deletedRows: deleted }
  }

  // Count how many days have data to archive
  const dayRows = await db
    .select({
      day: sql<string>`date(${auditLog.createdAt})`,
      count: sql<number>`count(*)::int`,
    })
    .from(auditLog)
    .where(lt(auditLog.createdAt, cutoff))
    .groupBy(sql`date(${auditLog.createdAt})`)
    .orderBy(sql`date(${auditLog.createdAt})`)

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
      const archived = await archiveDay(day, dayStart, dayEnd)
      archivedDays++
      archivedRows += archived
      deletedRows += archived
      log.info('Archived audit log day', { day, rows: archived })
    } catch (err) {
      log.error('Failed to archive audit log day', {
        day,
        err: err instanceof Error ? err.message : String(err),
      })
      // Continue with remaining days — don't let one bad day block
      // all older data forever.
      continue
    }
  }

  log.info('Audit log archive completed', { archivedDays, archivedRows, deletedRows })
  return { archivedDays, archivedRows, deletedRows }
}

async function archiveDay(day: string, dayStart: Date, dayEnd: Date): Promise<number> {
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
  let cursorId: bigint | undefined

  // Paginate through the day's data in batches using id as cursor
  // (createdAt is not unique, so id is the tie-breaker).
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

    const lines = rows.map((row) =>
      JSON.stringify({
        id: String(row.id),
        action: row.action,
        actorId: row.actorId ? String(row.actorId) : null,
        actorRole: row.actorRole,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        details: row.details,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      }),
    )

    gzip.write(lines.join('\n') + '\n')

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

  // Upload to S3
  await putS3Object(key, buffer, 'application/gzip')

  // Only delete from DB after successful upload
  const deleteResult = await db
    .delete(auditLog)
    .where(and(gte(auditLog.createdAt, dayStart), lt(auditLog.createdAt, dayEnd)))

  const deleted = Number(deleteResult.rowCount ?? 0)
  return deleted
}

// ---------------------------------------------------------------------------
// Clean up expired S3 archives
// ---------------------------------------------------------------------------

export async function cleanupExpiredArchives(): Promise<CleanupResult> {
  const bundle = getBlogSettingsBundleSync()
  const archiveRetentionDays = bundle?.limits?.auditLogArchiveRetentionDays ?? 180

  const storage = bundle?.assets?.storage
  const s3Available = storage?.enabled === true && storage.secretAccessKey !== ''
  if (!s3Available) {
    log.info('S3 storage unavailable; skipping expired archive cleanup')
    return { deletedFiles: 0 }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - archiveRetentionDays)

  log.info('Starting S3 archive cleanup', { cutoff: cutoff.toISOString(), archiveRetentionDays })

  const objects = await listS3Objects(S3_ARCHIVE_PREFIX)
  const toDelete = objects.filter((o) => o.lastModified < cutoff).map((o) => o.key)

  if (toDelete.length === 0) {
    log.info('No expired S3 archives to clean up')
    return { deletedFiles: 0 }
  }

  await deleteS3Objects(toDelete)

  log.info('S3 archive cleanup completed', { deletedFiles: toDelete.length })
  return { deletedFiles: toDelete.length }
}

// ---------------------------------------------------------------------------
// Run the full archive job
// ---------------------------------------------------------------------------

export async function runArchiveJob(): Promise<void> {
  try {
    const archiveResult = await archiveExpiredAuditLogs()
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
