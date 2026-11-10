import type { Readable } from 'node:stream'

import { sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { chmodSync, statSync } from 'node:fs'
import { copyFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createGzip } from 'node:zlib'

import type { Database } from '@/server/infra/db/database'
import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'
import type { BackupFileDto } from '@/shared/types/backup'

import { createBackupCipher } from '@/server/domains/backup/services/crypto'
import { createTarReadStream } from '@/server/domains/backup/services/tar'
import { CONFIG_FILE_NAME, resolveConfigFilePath } from '@/server/infra/config'
import { finishJobRun, startJobRun } from '@/server/infra/db/job-run-recorder'
import {
  deleteBackupRow,
  findBackupByTimestamp,
  findOldBackupRows,
  insertBackup,
  insertBackupIfMissing,
  listBackupRows,
  listBackupStoragePaths,
} from '@/server/infra/db/operations/backup'
import { descriptorFor, rawMessageDescriptor } from '@/server/infra/http/error-descriptor'
import { ActionFailure, DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { activeBackend, allBackends, backendFor } from '@/server/infra/storage/registry'

const log = getLogger('backup.service')

// New ids append a 64-bit random hex suffix so backup object names stay
// unguessable; the suffix stays optional so timestamp-only ids still parse.
const BACKUP_ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-[0-9a-f]{16})?$/

export function isValidBackupKey(key: string): boolean {
  return BACKUP_ID_RE.test(key)
}

export function buildBackupS3Key(backupId: string, encrypted = false): string {
  return `backup/backup-${backupId}.db.tar.gz${encrypted ? '.enc' : ''}`
}

/** The `.enc` storage suffix — not a stream probe — is the encryption marker (format in services/crypto). */
export function isEncryptedBackupKey(key: string): boolean {
  return key.endsWith('.enc')
}

function parseBackupIdFromKey(key: string): string | null {
  // Current `.db.tar.gz` and legacy content-only `.db.gz`, each optionally `.enc`.
  const match = /^backup\/backup-(.+)\.db(?:\.tar)?\.gz(?:\.enc)?$/.exec(key)
  if (match === null) {
    return null
  }
  return isValidBackupKey(match[1]) ? match[1] : null
}

/**
 * Whether a row's `storage_path` is still one of OUR keys — the row rides
 * inside a restored database, so a crafted archive can point it at any object
 * the backend can reach. Every read/delete path checks this first.
 */
export function isValidBackupStoragePath(key: string): boolean {
  return parseBackupIdFromKey(key) !== null
}

/** Backup staging files hold a full DB dump — keep them owner-only. */
function restrictStagingFile(filePath: string): void {
  try {
    chmodSync(filePath, 0o600)
  } catch (error) {
    log.warn('Backup: failed to restrict staging file permissions', {
      filePath,
      err: error instanceof Error ? error.message : String(error),
    })
  }
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
    const backupId = parseBackupIdFromKey(obj.key)
    if (backupId === null) {
      continue
    }
    await insertBackupIfMissing(db, {
      timestamp: backupId,
      storagePath: obj.key,
      storageDriver: obj.driver,
      byteSize: obj.size,
    })
    known.add(obj.key)
  }
}

// Snapshot fn injected by the composition root (the domain must not import bootstrap).
let snapshotAnalytics: ((stagingPath: string) => Promise<boolean>) | null = null

export function wireBackupSnapshots(deps: { snapshotAnalyticsTo: (stagingPath: string) => Promise<boolean> }): void {
  snapshotAnalytics = deps.snapshotAnalyticsTo
}

// Encryption password resolver injected by the composition root (Platform
// domains must not import settings); unwired means "no encryption".
let encryptionPasswordResolver: (() => string | null) | null = null

export function wireBackupEncryption(deps: { resolveEncryptionPassword: () => string | null }): void {
  encryptionPasswordResolver = deps.resolveEncryptionPassword
}

/** Test seam: drop encryption wiring between cases. */
export function resetBackupEncryption(): void {
  encryptionPasswordResolver = null
}

/** Thrown when `backup.encryption.enabled` is true but no password is stored —
 *  a plaintext archive must never be written while the UI claims encryption.
 *  Create lets it propagate; restore declines into the password prompt. */
export class BackupEncryptionMisconfiguredError extends Error {
  /** User-facing descriptor; `message` stays the English technical fallback. */
  readonly descriptor: ErrorMessageDescriptor

  constructor(descriptor: ErrorMessageDescriptor | string) {
    const resolved = typeof descriptor === 'string' ? rawMessageDescriptor(descriptor) : descriptor
    super(resolved.fallbackMessage)
    this.descriptor = resolved
    this.name = 'BackupEncryptionMisconfiguredError'
  }
}

export function resolveStoredEncryptionPassword(): string | null {
  try {
    return encryptionPasswordResolver?.() ?? null
  } catch (error) {
    // A misconfigured encryption toggle must not fail a RESTORE — decline
    // into the password prompt like an unset password would.
    if (error instanceof BackupEncryptionMisconfiguredError) {
      return null
    }
    throw error
  }
}

export interface CreateBackupOptions {
  /** Per-run override (manual backups); empty/absent falls back to the wired settings password. */
  passwordOverride?: string
}

// Single-flight: two concurrent runs would race the same staging/restore
// window and double-write job history.
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
  options: CreateBackupOptions = {},
): Promise<{ fileName: string; size: number; timestamp: string }> {
  if (!tryBeginBackup()) {
    throw new DomainError('CONFLICT', descriptorFor('backup.error.taskRunning'))
  }
  try {
    return await createBackupUnchecked(db, createdBy, options)
  } finally {
    backupRunning = false
  }
}

/**
 * Manual backup with a `job_run` row; the scheduled path records its own, so
 * this never double-records. Any failure — including the CONFLICT
 * single-flight rejection — finishes the row as `failed`.
 */
export async function createManualBackup(db: Database, options: CreateBackupOptions = {}) {
  const runId = startJobRun('backup', 'manual')
  try {
    const result = await createBackup(db, null, options)
    finishJobRun(runId, 'success')
    return result
  } catch (error) {
    finishJobRun(runId, 'failed', error instanceof Error ? error.message : String(error))
    throw error
  }
}

async function createBackupUnchecked(
  db: Database,
  createdBy: number | null,
  options: CreateBackupOptions,
): Promise<{ fileName: string; size: number; timestamp: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupId = `${timestamp}-${randomBytes(8).toString('hex')}`
  const override = options.passwordOverride?.trim()
  const password = override !== undefined && override !== '' ? override : (encryptionPasswordResolver?.() ?? null)
  const key = buildBackupS3Key(backupId, password !== null)
  // Unique per-attempt suffix — a stale file from a crashed attempt must not collide.
  const attemptId = randomBytes(6).toString('hex')
  const stagingPath = path.join(tmpdir(), `kobato-backup-${backupId}-${attemptId}.db`)
  const analyticsStagingPath = path.join(tmpdir(), `kobato-backup-${backupId}-${attemptId}.duckdb`)
  let configStagingPath: string | null = null

  log.info('Starting backup', { key })

  // `VACUUM INTO`: a consistent, fully-checkpointed copy in one step.
  db.run(sql.raw(`VACUUM INTO '${stagingPath.replaceAll("'", "''")}'`))
  restrictStagingFile(stagingPath)

  // Unwired snapshot fn is a composition-root bug — fail loudly, don't archive content only.
  const snapshot = snapshotAnalytics
  if (snapshot === null) {
    throw new Error('createBackup ran before wireBackupSnapshots')
  }

  try {
    const entries: { name: string; path: string; size: number }[] = []
    try {
      if (await snapshot(analyticsStagingPath)) {
        restrictStagingFile(analyticsStagingPath)
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

    // The env-converged config rides along so a restored instance keeps its
    // infra config; best-effort (null in env-only mode). copyFile keeps a
    // mid-stream rewrite from tearing the tar entry.
    const configPath = resolveConfigFilePath()
    if (configPath !== null) {
      try {
        configStagingPath = path.join(tmpdir(), `kobato-backup-${backupId}-${attemptId}.config.json`)
        await copyFile(configPath, configStagingPath)
        restrictStagingFile(configStagingPath)
        entries.push({ name: CONFIG_FILE_NAME, path: configStagingPath, size: 0 })
      } catch (error) {
        configStagingPath = null
        log.warn('Backup: config file unavailable; archiving without it', {
          err: error instanceof Error ? error.message : String(error),
        })
      }
    }

    for (const entry of entries) {
      entry.size = statSync(entry.path).size
    }
    const gzip = createGzip()
    const archive = createTarReadStream(entries).pipe(gzip)
    const { backend, driver } = activeBackend()
    // Stored size comes from the backend's return value — never a gzip 'data' listener.
    const stored = await backend.putStream({
      key,
      body: password !== null ? archive.pipe(createBackupCipher(password)) : archive,
      contentType: password !== null ? 'application/octet-stream' : 'application/gzip',
      visibility: 'private',
    })

    await insertBackup(db, {
      timestamp: backupId,
      storagePath: key,
      storageDriver: driver,
      byteSize: stored.size,
      createdBy,
    })

    log.info('Backup completed', {
      key,
      driver,
      size: stored.size,
      entries: entries.length,
      encrypted: password !== null,
    })
    return { fileName: key.split('/').pop()!, size: stored.size, timestamp: backupId }
  } finally {
    await unlink(stagingPath).catch(() => undefined)
    await unlink(analyticsStagingPath).catch(() => undefined)
    if (configStagingPath !== null) {
      await unlink(configStagingPath).catch(() => undefined)
    }
  }
}

export async function listBackups(
  db: Database,
  limit?: number,
  continuationToken?: string,
): Promise<{ files: BackupFileDto[]; nextContinuationToken?: string }> {
  const offset = parseOffset(continuationToken)
  await reconcileBackups(db)
  const rows = await listBackupRows(db, limit, offset ?? undefined)
  const files: BackupFileDto[] = rows.map((row) => ({
    key: row.timestamp,
    fileName: row.storagePath.split('/').pop()!,
    size: row.byteSize,
    lastModified: row.createdAt.toISOString(),
    encrypted: isEncryptedBackupKey(row.storagePath),
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
    throw new ActionFailure(404, descriptorFor('backup.error.notFound'))
  }
  if (!isValidBackupStoragePath(row.storagePath)) {
    throw new ActionFailure(400, descriptorFor('backup.error.storagePathRead'))
  }
  return backendFor(row.storageDriver).get(row.storagePath)
}

/** Streamed, so neither the restore pipeline nor the download endpoint holds
 * the archive in memory; `byteSize` lets the route set Content-Length. */
export async function getBackupStream(
  db: Database,
  timestamp: string,
): Promise<{ stream: Readable; byteSize: number; encrypted: boolean; fileName: string }> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    throw new ActionFailure(404, descriptorFor('backup.error.notFound'))
  }
  // The ROW's path rides in from a restored database and is NOT route-validated —
  // check it against the key grammar first.
  if (!isValidBackupStoragePath(row.storagePath)) {
    throw new ActionFailure(400, descriptorFor('backup.error.storagePathDownload'))
  }
  const stream = await backendFor(row.storageDriver).getStream(row.storagePath)
  return {
    stream,
    byteSize: row.byteSize,
    encrypted: isEncryptedBackupKey(row.storagePath),
    // Carries the real suffix (`.db.tar.gz`, legacy `.db.gz`, `.enc`) — never hardcode a name.
    fileName: row.storagePath.split('/').pop()!,
  }
}

/** Row-level check (no stream opened); the restore resolves the password BEFORE claiming the slot. */
export async function isBackupEncrypted(db: Database, timestamp: string): Promise<boolean> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    throw new ActionFailure(404, descriptorFor('backup.error.notFound'))
  }
  return isEncryptedBackupKey(row.storagePath)
}

export async function deleteBackup(db: Database, timestamp: string): Promise<void> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    log.warn('Backup delete: row not found; nothing to delete', { timestamp })
    return
  }
  if (!isValidBackupStoragePath(row.storagePath)) {
    // The row's path came from a restored DB and may name a live asset —
    // drop the row only; the object it points at stays untouched.
    log.warn('Backup delete: row storage path failed validation; object untouched', {
      timestamp,
      storagePath: row.storagePath,
    })
    await deleteBackupRow(db, row.id)
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
    if (!isValidBackupStoragePath(row.storagePath)) {
      // Same posture as the explicit delete: never touch the named object;
      // drop the row so the sweep stops retrying it.
      log.warn('Old backup row has an invalid storage path; object untouched', {
        timestamp: row.timestamp,
        storagePath: row.storagePath,
      })
      await deleteBackupRow(db, row.id)
      continue
    }
    try {
      await backendFor(row.storageDriver).delete(row.storagePath)
    } catch (error) {
      log.warn('Old backup file delete failed; removing row anyway', { timestamp: row.timestamp, error: String(error) })
    }
    await deleteBackupRow(db, row.id)
  }
}
