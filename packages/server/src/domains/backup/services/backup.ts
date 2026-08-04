import type { Database } from '@kobato/server/infra/db/database'
import type { BackupFileDto } from '@kobato/shared/types/backup'
import type { Readable } from 'node:stream'

import { createTarReadStream } from '@kobato/server/domains/backup/services/tar'
import {
  deleteBackupRow,
  findBackupByTimestamp,
  findOldBackupRows,
  insertBackup,
  insertBackupIfMissing,
  listBackupRows,
  listBackupStoragePaths,
} from '@kobato/server/infra/db/operations/backup'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { activeBackend, allBackends, backendFor } from '@kobato/server/infra/storage/registry'
import { sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createGzip } from 'node:zlib'

const log = getLogger('backup.service')

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/

export function isValidBackupKey(key: string): boolean {
  return TIMESTAMP_RE.test(key)
}

export function buildBackupS3Key(timestamp: string): string {
  return `backup/backup-${timestamp}.db.tar.gz`
}

function parseTimestampFromKey(key: string): string | null {
  // Both archive generations: the two-file `.db.tar.gz` and the legacy
  // content-only `.db.gz` (still restorable — see services/restore).
  const match = key.match(/^backup\/backup-(.+)\.db(?:\.tar)?\.gz$/)
  if (match === null) {
    return null
  }
  return isValidBackupKey(match[1]) ? match[1] : null
}

/**
 * Self-healing reconcile: scan both backends for `backup/*.db.gz` and
 * `backup/*.db.tar.gz` objects that have no DB row and insert them.
 * Picks up pre-existing S3 backups on first run after upgrade, plus any
 * files a migration left behind. Cheap (the `backup/` prefix holds a
 * handful of objects) and idempotent via the `storage_path` unique
 * constraint.
 */
async function reconcileBackups(db: Database): Promise<void> {
  const known = new Set(await listBackupStoragePaths(db))
  const candidates: { key: string; size: number; driver: 's3' | 'local' }[] = []
  // Scan every registered backend (s3 first, then local — a key present in
  // both is attributed to s3). A listing failure in one backend must not
  // abort the scan of the others.
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

// The analytics sidecar snapshot is injected by the composition root
// (`@kobato/server/bootstrap/db-lifecycle`, which owns the analytics engine)
// at wire time — a direct import of bootstrap/analytics-lifecycle here
// would invert the dependency direction (domain → composition root) and
// risk an import cycle. Same injection discipline as
// `wireBackupScheduler` in `@kobato/server/domains/backup/scheduler`.
let snapshotAnalytics: ((stagingPath: string) => Promise<boolean>) | null = null

export function wireBackupSnapshots(deps: { snapshotAnalyticsTo: (stagingPath: string) => Promise<boolean> }): void {
  snapshotAnalytics = deps.snapshotAnalyticsTo
}

// Single-flight claim for backup creation — the timestamp has SECOND
// precision and names the S3 key and DB row, so two backups starting in
// the same second collide: the loser's `VACUUM INTO` failed opaquely on
// the shared staging file, or its insert hit `uq_backup_storage_path`.
// Occupied/free slot (the restore machine's `tryBeginRestore` shape —
// share-in-flight does NOT apply: a second backup must never join the
// first's archive); failure: release — the `finally` in `createBackup`
// always frees the claim, so a crashed attempt never wedges the slot.
let backupRunning = false

/** Atomically claim the backup slot: true when this caller got it. */
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
  // Per-attempt staging suffix: the single-flight claim is process-local,
  // so a stale file a crashed same-second attempt left behind (or another
  // process on the same host) must never collide with this run's
  // `VACUUM INTO` target.
  const attemptId = randomBytes(6).toString('hex')
  const stagingPath = path.join(tmpdir(), `kobato-backup-${timestamp}-${attemptId}.db`)
  const analyticsStagingPath = path.join(tmpdir(), `kobato-backup-${timestamp}-${attemptId}.duckdb`)

  log.info('Starting backup', { key })

  // `VACUUM INTO` produces a consistent, fully-checkpointed copy of the
  // live content database in one step — no WAL sidecars to chase, and
  // (as a defragmented rewrite) a smaller file than the live one. The
  // DuckDB sidecar checkpoints through its writer and is copied
  // byte-for-byte — append-only telemetry tolerates the handoff.
  db.run(sql.raw(`VACUUM INTO '${stagingPath.replaceAll("'", "''")}'`))

  // Unwired is a composition-root bug, not an expendable-sidecar
  // condition — fail loudly instead of silently archiving content only.
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
      // The sidecar is expendable telemetry: a missing/closed analytics
      // handle never blocks the content backup.
      log.warn('Backup: analytics sidecar unavailable; archiving content only', {
        err: error instanceof Error ? error.message : String(error),
      })
    }

    // Streaming archive: tar headers + file contents flow through gzip
    // into the backend — a full database file is never held in memory.
    entries.unshift({ name: 'kobato.db', path: stagingPath, size: 0 })
    for (const entry of entries) {
      entry.size = statSync(entry.path).size
    }
    const gzip = createGzip()
    const { backend, driver } = activeBackend()
    // The stored size comes from the backend's return value — never from a
    // `gzip.on('data')` counter: attaching a 'data' listener flips the gzip
    // stream into flowing mode, bypassing the pipe's backpressure and
    // racing the backend consumer, which deterministically dropped the
    // first chunk (the 10-byte gzip header) against the local backend's
    // pipeline while the counter still counted it.
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

/**
 * The unbuffered read: a stream, so neither the restore staging pipeline
 * nor the download endpoint ever holds the archive in memory — backups
 * run to `MAX_BACKUP_FILE_SIZE` (500MB), well past the 100MB cap buffered
 * reads (`get` / `getBackupBuffer`) enforce. `byteSize` (the recorded
 * upload size) rides along so the download route can set Content-Length.
 */
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
