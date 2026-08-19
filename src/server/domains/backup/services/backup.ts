import type { Readable } from 'node:stream'

import { sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createGzip } from 'node:zlib'

import type { Database } from '@/server/infra/db/database'
import type { BackupFileDto } from '@/shared/types/backup'

import { createTarReadStream } from '@/server/domains/backup/services/tar'
import {
  deleteBackupRow,
  findBackupByTimestamp,
  findOldBackupRows,
  insertBackup,
  insertBackupIfMissing,
  listBackupRows,
  listBackupStoragePaths,
} from '@/server/infra/db/operations/backup'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { activeBackend, allBackends, backendFor } from '@/server/infra/storage/registry'

const log = getLogger('backup.service')

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/

export function isValidBackupKey(key: string): boolean {
  return TIMESTAMP_RE.test(key)
}

export function buildBackupS3Key(timestamp: string): string {
  return `backup/backup-${timestamp}.db.tar.gz`
}

function parseTimestampFromKey(key: string): string | null {
  // Both archive generations: `.db.tar.gz` and legacy content-only `.db.gz`.
  const match = /^backup\/backup-(.+)\.db(?:\.tar)?\.gz$/.exec(key)
  if (match === null) {
    return null
  }
  return isValidBackupKey(match[1]) ? match[1] : null
}

/** Reconcile: insert DB rows for backend objects that have none — idempotent
 * via the `storage_path` unique constraint. */
async function reconcileBackups(db: Database): Promise<void> {
  const known = new Set(await listBackupStoragePaths(db))
  const candidates: { key: string; size: number; driver: 's3' | 'local' }[] = []
  // A listing failure in one backend must not abort the scan of the others.
  for (const { backend, driver } of allBackends()) {
    try {
      for (const obj of await backend.list('backup/')) {
        candidates.push({ key: obj.key, size: obj.size, driver })
      }
    } catch (error) {
      log.warn('Reconcile: backend listing failed; continuing with the rest', { driver, error: String(error) })
    }
  }

  for (const obj of candidates) {
    if (known.has(obj.key)) {
      continue
    }
    const timestamp = parseTimestampFromKey(obj.key)
    if (timestamp === null) {
      continue
    }
    await insertBackupIfMissing(db, {
      timestamp,
      storagePath: obj.key,
      storageDriver: obj.driver,
      byteSize: obj.size,
    })
    known.add(obj.key)
  }
}

// Snapshot fn injected by the composition root at wire time (avoids the domain → bootstrap cycle).
let snapshotAnalytics: ((stagingPath: string) => Promise<boolean>) | null = null

export function wireBackupSnapshots(deps: { snapshotAnalyticsTo: (stagingPath: string) => Promise<boolean> }): void {
  snapshotAnalytics = deps.snapshotAnalyticsTo
}

// Single-flight: same-second timestamps would collide on the S3 key and DB row.
let backupRunning = false

export function tryBeginBackup(): boolean {
  if (backupRunning) {
    return false
  }
  backupRunning = true
  return true
}

export async function createBackup(
  db: Database,
  createdBy: number | null = null,
): Promise<{ fileName: string; size: number; timestamp: string }> {
  if (!tryBeginBackup()) {
    throw new DomainError('CONFLICT', '已有备份任务正在进行，请等待完成后再试。')
  }
  try {
    return await createBackupUnchecked(db, createdBy)
  } finally {
    backupRunning = false
  }
}

async function createBackupUnchecked(
  db: Database,
  createdBy: number | null,
): Promise<{ fileName: string; size: number; timestamp: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const key = buildBackupS3Key(timestamp)
  // Unique per-attempt suffix — a stale file from a crashed attempt must not collide.
  const attemptId = randomBytes(6).toString('hex')
  const stagingPath = path.join(tmpdir(), `kobato-backup-${timestamp}-${attemptId}.db`)
  const analyticsStagingPath = path.join(tmpdir(), `kobato-backup-${timestamp}-${attemptId}.duckdb`)

  log.info('Starting backup', { key })

  // `VACUUM INTO`: a consistent, fully-checkpointed copy in one step; the sidecar is copied byte-for-byte.
  db.run(sql.raw(`VACUUM INTO '${stagingPath.replaceAll("'", "''")}'`))

  // Unwired snapshot fn is a composition-root bug — fail loudly, don't archive content only.
  const snapshot = snapshotAnalytics
  if (snapshot === null) {
    throw new Error('createBackup ran before wireBackupSnapshots')
  }

  try {
    const entries: { name: string; path: string; size: number }[] = []
    try {
      if (await snapshot(analyticsStagingPath)) {
        entries.push({ name: 'analytics.duckdb', path: analyticsStagingPath, size: 0 })
      }
    } catch (error) {
      // Sidecar is expendable — never block the content backup on it.
      log.warn('Backup: analytics sidecar unavailable; archiving content only', {
        err: error instanceof Error ? error.message : String(error),
      })
    }

    // Streaming archive — a full database file is never held in memory.
    entries.unshift({ name: 'kobato.db', path: stagingPath, size: 0 })
    for (const entry of entries) {
      entry.size = statSync(entry.path).size
    }
    const gzip = createGzip()
    const { backend, driver } = activeBackend()
    // Stored size comes from the backend's return value — never a gzip 'data' listener.
    const stored = await backend.putStream({
      key,
      body: createTarReadStream(entries).pipe(gzip),
      contentType: 'application/gzip',
      visibility: 'private',
    })

    await insertBackup(db, {
      timestamp,
      storagePath: key,
      storageDriver: driver,
      byteSize: stored.size,
      createdBy,
    })

    log.info('Backup completed', { key, driver, size: stored.size, entries: entries.length })
    return { fileName: key.split('/').pop()!, size: stored.size, timestamp }
  } finally {
    await unlink(stagingPath).catch(() => undefined)
    await unlink(analyticsStagingPath).catch(() => undefined)
  }
}

export async function listBackups(
  db: Database,
  limit?: number,
  continuationToken?: string,
): Promise<{ files: BackupFileDto[]; nextContinuationToken?: string }> {
  // Offset-based pagination keyed off the opaque continuation token.
  const offset = parseOffset(continuationToken)
  await reconcileBackups(db)
  const rows = await listBackupRows(db, limit, offset ?? undefined)
  const files: BackupFileDto[] = rows.map((row) => ({
    key: row.timestamp,
    fileName: row.storagePath.split('/').pop()!,
    size: row.byteSize,
    lastModified: row.createdAt.toISOString(),
  }))
  const nextContinuationToken = limit !== undefined && rows.length === limit ? String((offset ?? 0) + limit) : undefined
  return { files, nextContinuationToken }
}

function parseOffset(token: string | undefined): number | null {
  if (token === undefined || token === '') {
    return null
  }
  const n = Number.parseInt(token, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function getBackupBuffer(db: Database, timestamp: string): Promise<Buffer> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    throw new Error(`Backup row not found for timestamp ${timestamp}`)
  }
  return backendFor(row.storageDriver).get(row.storagePath)
}

/** Unbuffered read: a stream, so neither the restore pipeline nor the download
 * endpoint holds the archive in memory. `byteSize` lets the route set Content-Length. */
export async function getBackupStream(
  db: Database,
  timestamp: string,
): Promise<{ stream: Readable; byteSize: number }> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    throw new Error(`Backup row not found for timestamp ${timestamp}`)
  }
  const stream = await backendFor(row.storageDriver).getStream(row.storagePath)
  return { stream, byteSize: row.byteSize }
}

export async function deleteBackup(db: Database, timestamp: string): Promise<void> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    log.warn('Backup delete: row not found; nothing to delete', { timestamp })
    return
  }
  // Best-effort delete: drop the row even if storage removal fails; `reconcileBackups` re-registers orphans.
  try {
    await backendFor(row.storageDriver).delete(row.storagePath)
  } catch (error) {
    log.warn('Backup file delete failed; removing row anyway', {
      timestamp,
      driver: row.storageDriver,
      error: String(error),
    })
  }
  await deleteBackupRow(db, row.id)
  log.info('Backup deleted', { timestamp, driver: row.storageDriver })
}

export async function cleanupOldBackups(db: Database, days: number): Promise<void> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await findOldBackupRows(db, cutoff)
  if (rows.length === 0) {
    return
  }
  log.info('Cleaning up old backups', { count: rows.length, cutoff: cutoff.toISOString() })
  for (const row of rows) {
    try {
      await backendFor(row.storageDriver).delete(row.storagePath)
    } catch (error) {
      log.warn('Old backup file delete failed; removing row anyway', { timestamp: row.timestamp, error: String(error) })
    }
    await deleteBackupRow(db, row.id)
  }
}
