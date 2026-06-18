import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { spawn } from 'node:child_process'
import { PassThrough, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

import type { BackupFileDto } from '@/shared/types/backup'

import { ensurePgTools, getPgConnectionOptions } from '@/server/domains/backup/services/shared'
import { BACKUP_HEADER_MARKER } from '@/server/domains/backup/services/validate'
import {
  deleteBackupRow,
  findBackupByTimestamp,
  findOldBackupRows,
  insertBackup,
  insertBackupIfMissing,
  listBackupRows,
  listBackupStoragePaths,
} from '@/server/infra/db/operations/backup'
import { getLogger } from '@/server/infra/logger'
import { localBackend } from '@/server/infra/storage/backends/local'
import { s3Backend } from '@/server/infra/storage/backends/s3'
import { activeBackend, backendFor } from '@/server/infra/storage/registry'

const log = getLogger('backup.service')

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/

export function isValidBackupKey(key: string): boolean {
  return TIMESTAMP_RE.test(key)
}

export function buildBackupS3Key(timestamp: string): string {
  return `backup/backup-${timestamp}.sql.gz`
}

function parseTimestampFromKey(key: string): string | null {
  const match = key.match(/^backup\/backup-(.+)\.sql\.gz$/)
  if (match === null) {
    return null
  }
  return isValidBackupKey(match[1]) ? match[1] : null
}

/**
 * Self-healing reconcile: scan both backends for `backup/*.sql.gz` objects
 * that have no DB row and insert them. Picks up pre-existing S3 backups on
 * first run after upgrade, plus any files a migration left behind. Cheap
 * (the `backup/` prefix holds a handful of objects) and idempotent via the
 * `storage_path` unique constraint.
 */
async function reconcileBackups(db: NodePgDatabase): Promise<void> {
  const known = new Set(await listBackupStoragePaths(db))
  const candidates: { key: string; size: number; driver: 's3' | 'local' }[] = []
  try {
    for (const obj of await s3Backend.list('backup/')) {
      candidates.push({ key: obj.key, size: obj.size, driver: 's3' })
    }
  } catch (error) {
    log.warn('Reconcile: S3 listing failed; continuing with local only', { error: String(error) })
  }
  try {
    for (const obj of await localBackend.list('backup/')) {
      candidates.push({ key: obj.key, size: obj.size, driver: 'local' })
    }
  } catch {
    // Local storage dir may simply be empty — ignore.
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

export async function createBackup(
  db: NodePgDatabase,
  createdBy: bigint | null = null,
): Promise<{ fileName: string; size: number; timestamp: string }> {
  await ensurePgTools()
  const { args: connArgs, env } = getPgConnectionOptions()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const key = buildBackupS3Key(timestamp)

  log.info('Starting backup', { key })

  const pgDump = spawn(
    'pg_dump',
    ['--no-owner', '--no-acl', '--clean', '--if-exists', '--exclude-table-data=audit_log', ...connArgs],
    { env },
  )

  const gzip = createGzip()

  // Prepend the project-specific header so restore can verify the file origin.
  const header = Buffer.from(BACKUP_HEADER_MARKER + '\n')
  let headerSent = false
  const headerTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!headerSent) {
        headerSent = true
        callback(null, Buffer.concat([header, chunk]))
      } else {
        callback(null, chunk)
      }
    },
  })

  let uploadedBytes = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      uploadedBytes += chunk.length
      callback(null, chunk)
    },
  })

  // Decouple the upload stream from the pipeline destination so the storage
  // backend is the sole consumer of the readable side (mirrors the original
  // S3 pipeline rationale).
  const uploadStream = new PassThrough()

  const streamDone = pipeline(pgDump.stdout, headerTransform, gzip, counter, uploadStream)

  const stderrChunks: Buffer[] = []
  pgDump.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk)
  })

  const pgDumpDone = new Promise<void>((resolve, reject) => {
    pgDump.on('error', reject)
    pgDump.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()
        log.error('pg_dump failed', { code, key, stderr: stderr || undefined })
        reject(new Error(`pg_dump 退出码 ${code}${stderr ? `: ${stderr}` : ''}`))
      } else {
        resolve()
      }
    })
  })

  const { backend, driver } = activeBackend()
  if (backend.putStream === undefined) {
    throw new Error('Active storage backend does not support streaming uploads; cannot create backup')
  }
  const uploadDone = backend.putStream({
    key,
    body: uploadStream,
    contentType: 'application/gzip',
    visibility: 'private',
  })

  await Promise.all([streamDone, pgDumpDone, uploadDone])

  await insertBackup(db, {
    timestamp,
    storagePath: key,
    storageDriver: driver,
    byteSize: uploadedBytes,
    createdBy,
  })

  log.info('Backup completed', { key, driver, size: uploadedBytes })
  return { fileName: key.split('/').pop()!, size: uploadedBytes, timestamp }
}

export async function listBackups(
  db: NodePgDatabase,
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

export async function getBackupBuffer(db: NodePgDatabase, timestamp: string): Promise<Buffer> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    throw new Error(`Backup row not found for timestamp ${timestamp}`)
  }
  return backendFor(row.storageDriver).get(row.storagePath)
}

export async function deleteBackup(db: NodePgDatabase, timestamp: string): Promise<void> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    log.warn('Backup delete: row not found; nothing to delete', { timestamp })
    return
  }
  // Intentional best-effort: if the storage delete fails (e.g. the object
  // was already pruned, or the backend is momentarily unreachable) we still
  // drop the DB row so the admin action succeeds. `reconcileBackups`
  // (called from `listBackups`) re-registers any orphaned file it rediscovers
  // in either backend, so a leftover object self-heals back into the list
  // rather than leaking silently.
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

export async function cleanupOldBackups(db: NodePgDatabase, days: number): Promise<void> {
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
