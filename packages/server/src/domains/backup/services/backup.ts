import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error.ts'
import type { BackupFileDto } from '@kobato/contracts/backup.ts'
import type { Database } from '@kobato/db/database.ts'
import type { Readable } from 'node:stream'

import {
  deleteBackupRow,
  findBackupByTimestamp,
  findOldBackupRows,
  insertBackup,
  insertBackupIfMissing,
  listBackupRows,
  listBackupStoragePaths,
} from '@kobato/db/operations/backup.ts'
import { vacuumDatabaseInto } from '@kobato/db/operations/maintenance.ts'
import { createBackupCipher } from '@kobato/server/domains/backup/services/crypto.ts'
import { createTarReadStream } from '@kobato/server/domains/backup/services/tar.ts'
import { CONFIG_FILE_NAME, resolveConfigFilePath } from '@kobato/server/infra/config.ts'
import { finishJobRun, startJobRun } from '@kobato/server/infra/db/job-run-recorder.ts'
import { descriptorFor, rawMessageDescriptor } from '@kobato/server/infra/http/error-descriptor.ts'
import { ActionFailure, DomainError } from '@kobato/server/infra/http/errors.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { activeBackend, allBackends, backendFor } from '@kobato/server/infra/storage/registry.ts'
import { randomBytes } from 'node:crypto'
import { chmodSync, statSync } from 'node:fs'
import { copyFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createGzip } from 'node:zlib'

const log = getLogger('backup.service')

const BACKUP_ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-[0-9a-f]{16})?$/

export function isValidBackupKey(key: string): boolean {
  return BACKUP_ID_RE.test(key)
}

export function buildBackupS3Key(backupId: string, encrypted = false): string {
  return `backup/backup-${backupId}.db.tar.gz${encrypted ? '.enc' : ''}`
}

export function isEncryptedBackupKey(key: string): boolean {
  return key.endsWith('.enc')
}

function parseBackupIdFromKey(key: string): string | null {
  const match = /^backup\/backup-(.+)\.db(?:\.tar)?\.gz(?:\.enc)?$/.exec(key)
  if (match === null) {
    return null
  }
  return isValidBackupKey(match[1]) ? match[1] : null
}

export function isValidBackupStoragePath(key: string): boolean {
  return parseBackupIdFromKey(key) !== null
}

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

async function reconcileBackups(db: Database): Promise<void> {
  const known = new Set(await listBackupStoragePaths(db))
  const candidates: { key: string; size: number; driver: 's3' | 'local' }[] = []
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

let snapshotAnalytics: ((stagingPath: string) => Promise<boolean>) | null = null

export function wireBackupSnapshots(deps: { snapshotAnalyticsTo: (stagingPath: string) => Promise<boolean> }): void {
  snapshotAnalytics = deps.snapshotAnalyticsTo
}

let encryptionPasswordResolver: (() => string | null) | null = null

export function wireBackupEncryption(deps: { resolveEncryptionPassword: () => string | null }): void {
  encryptionPasswordResolver = deps.resolveEncryptionPassword
}

export function resetBackupEncryption(): void {
  encryptionPasswordResolver = null
}

export class BackupEncryptionMisconfiguredError extends Error {
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
    if (error instanceof BackupEncryptionMisconfiguredError) {
      return null
    }
    throw error
  }
}

export interface CreateBackupOptions {
  passwordOverride?: string
}

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
  const attemptId = randomBytes(6).toString('hex')
  const stagingPath = path.join(tmpdir(), `kobato-backup-${backupId}-${attemptId}.db`)
  const analyticsStagingPath = path.join(tmpdir(), `kobato-backup-${backupId}-${attemptId}.duckdb`)
  let configStagingPath: string | null = null

  log.info('Starting backup', { key })

  vacuumDatabaseInto(db, stagingPath)
  restrictStagingFile(stagingPath)

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
      log.warn('Backup: analytics sidecar unavailable; archiving content only', {
        err: error instanceof Error ? error.message : String(error),
      })
    }

    entries.unshift({ name: 'kobato.db', path: stagingPath, size: 0 })

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

export async function getBackupStream(
  db: Database,
  timestamp: string,
): Promise<{ stream: Readable; byteSize: number; encrypted: boolean; fileName: string }> {
  const row = await findBackupByTimestamp(db, timestamp)
  if (row === null) {
    throw new ActionFailure(404, descriptorFor('backup.error.notFound'))
  }
  if (!isValidBackupStoragePath(row.storagePath)) {
    throw new ActionFailure(400, descriptorFor('backup.error.storagePathDownload'))
  }
  const stream = await backendFor(row.storageDriver).getStream(row.storagePath)
  return {
    stream,
    byteSize: row.byteSize,
    encrypted: isEncryptedBackupKey(row.storagePath),
    fileName: row.storagePath.split('/').pop()!,
  }
}

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
    log.warn('Backup delete: row storage path failed validation; object untouched', {
      timestamp,
      storagePath: row.storagePath,
    })
    await deleteBackupRow(db, row.id)
    return
  }
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
