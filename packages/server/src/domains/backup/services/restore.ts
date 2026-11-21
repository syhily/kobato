import type { Readable } from 'node:stream'

import { isInMemoryPath } from '@kobato/db/database'
import {
  BackupDecryptionError,
  createBackupDecipher,
  isEncryptedBackup,
} from '@kobato/server/domains/backup/services/crypto'
import { isTarArchive, listTarEntriesInFile } from '@kobato/server/domains/backup/services/tar'
import {
  ConfigFileError,
  CONFIG_FILE_NAME,
  parseRestorableConfigJson,
  resolveConfigFilePath,
} from '@kobato/server/infra/config'
import { resolveAnalyticsPath, resolveDatabasePath } from '@kobato/server/infra/db/paths'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { createReadStream, createWriteStream, rmSync, statSync } from 'node:fs'
import {
  chmod,
  copyFile,
  mkdtemp,
  access,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

const log = getLogger('backup.service')

export const MAX_BACKUP_FILE_SIZE = 500 * 1024 * 1024

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1')

/** DuckDB's storage magic: 4 ASCII bytes after the 8-byte checksum. */
const DUCKDB_MAGIC_OFFSET = 8
const DUCKDB_MAGIC = 'DUCK'

const GZIP_MAGIC_1 = 0x1f
const GZIP_MAGIC_2 = 0x8b
const HEAD_BYTES = 600

export const RESTORE_TEMP_PREFIX = 'kobato-restore-'

export function hasSqliteMagic(buffer: Buffer): boolean {
  return buffer.length >= SQLITE_MAGIC.length && buffer.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)
}

export function hasDuckdbMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= DUCKDB_MAGIC_OFFSET + DUCKDB_MAGIC.length &&
    buffer.subarray(DUCKDB_MAGIC_OFFSET, DUCKDB_MAGIC_OFFSET + DUCKDB_MAGIC.length).toString('latin1') === DUCKDB_MAGIC
  )
}

export function assertSqliteBackup(buffer: Buffer): void {
  if (buffer.length > MAX_BACKUP_FILE_SIZE) {
    throw new ActionFailure(400, descriptorFor('backup.error.fileTooLarge'))
  }
  if (!hasSqliteMagic(buffer)) {
    throw new ActionFailure(400, descriptorFor('backup.error.notSqlite'))
  }
}

export function assertDuckdbBackup(buffer: Buffer): void {
  if (!hasDuckdbMagic(buffer)) {
    throw new ActionFailure(400, descriptorFor('backup.error.notDuckdb'))
  }
}

export class EncryptedBackupPasswordRequired extends Error {
  constructor(
    readonly dir: string,
    readonly uploadPath: string,
  ) {
    super('This backup is encrypted; a backup password is required')
    this.name = 'EncryptedBackupPasswordRequired'
  }
}

/** The supplied password failed the GCM tag check — the only retryable
 *  staging failure, so the decrypt endpoint keeps the parked upload for it. */
export class BackupPasswordError extends ActionFailure {
  constructor() {
    super(400, descriptorFor('backup.error.passwordWrong'))
    this.name = 'BackupPasswordError'
  }
}

export interface StagedBackup {
  dir: string
  content: string | null
  analytics: string | null
  config: string | null
}

async function readPrefix(path: string, length: number): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function copyRange(sourcePath: string, offset: number, size: number, destPath: string): Promise<void> {
  // A zero-length tar entry would compute end = start - 1, which
  // createReadStream rejects synchronously with ERR_OUT_OF_RANGE.
  if (size === 0) {
    await writeFile(destPath, '')
    return
  }
  await pipeline(createReadStream(sourcePath, { start: offset, end: offset + size - 1 }), createWriteStream(destPath))
}

export function decompressedSizeGuard(maxBytes: number): Transform {
  let total = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      if (total > maxBytes) {
        callback(new ActionFailure(400, descriptorFor('backup.error.fileTooLarge')))
        return
      }
      callback(null, chunk)
    },
  })
}

async function assertConfigBackup(configPath: string): Promise<void> {
  try {
    parseRestorableConfigJson(await readFile(configPath, 'utf8'))
  } catch (error) {
    if (!(error instanceof ConfigFileError)) {
      throw error
    }
    if (error.kind === 'json') {
      throw new ActionFailure(400, descriptorFor('backup.error.configNotJson'))
    }
    if (error.kind === 'shape') {
      throw new ActionFailure(400, descriptorFor('backup.error.configInvalid'))
    }
    throw new ActionFailure(400, descriptorFor('backup.error.configRejected', { message: error.message }))
  }
}

export interface StageBackupOptions {
  password?: string
  maxBytes?: number
  onProgress?: (stage: 'decrypting' | 'extracting', doneBytes: number, totalBytes: number | null) => void
}

function byteCounter(onBytes: (doneBytes: number) => void): Transform {
  let total = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      onBytes(total)
      callback(null, chunk)
    },
  })
}

export async function stageBackup(source: Buffer | Readable, options: StageBackupOptions = {}): Promise<StagedBackup> {
  const maxBytes = options.maxBytes ?? MAX_BACKUP_FILE_SIZE
  const dir = await mkdtemp(join(tmpdir(), RESTORE_TEMP_PREFIX))
  const uploadPath = join(dir, 'upload.bin')
  const rawPath = join(dir, 'payload')
  try {
    if (Buffer.isBuffer(source)) {
      await writeFile(uploadPath, source)
    } else {
      await pipeline(source, createWriteStream(uploadPath))
    }

    let payloadSource = uploadPath
    if (isEncryptedBackup(await readPrefix(uploadPath, 8))) {
      if (options.password === undefined || options.password === '') {
        throw new EncryptedBackupPasswordRequired(dir, uploadPath)
      }
      const decryptedPath = join(dir, 'decrypted.bin')
      try {
        const totalBytes = statSync(uploadPath).size
        const decryptCounter = options.onProgress
          ? byteCounter((done) => options.onProgress?.('decrypting', done, totalBytes))
          : null
        await pipeline(
          createReadStream(uploadPath),
          ...(decryptCounter !== null ? [decryptCounter] : []),
          createBackupDecipher(options.password),
          createWriteStream(decryptedPath),
        )
      } catch (error) {
        if (error instanceof BackupDecryptionError) {
          if (error.kind === 'auth') {
            throw new BackupPasswordError()
          }
          log.warn('backup decrypt failed (format)', { error: error.message })
          throw new ActionFailure(400, descriptorFor('backup.error.archiveCorrupt'))
        }
        throw error
      }
      payloadSource = decryptedPath
    }

    const magic = await readPrefix(payloadSource, 2)
    if (magic.length >= 2 && magic[0] === GZIP_MAGIC_1 && magic[1] === GZIP_MAGIC_2) {
      // Abort in-stream the moment the decompressed cap trips (gzip-bomb guard).
      const extractCounter = options.onProgress
        ? byteCounter((done) => options.onProgress?.('extracting', done, null))
        : null
      await pipeline(
        createReadStream(payloadSource),
        createGunzip(),
        decompressedSizeGuard(maxBytes),
        ...(extractCounter !== null ? [extractCounter] : []),
        createWriteStream(rawPath),
      )
    } else {
      await copyFile(payloadSource, rawPath)
    }
    const { size } = await stat(rawPath)
    if (size > maxBytes) {
      throw new ActionFailure(400, descriptorFor('backup.error.fileTooLarge'))
    }

    const head = await readPrefix(rawPath, HEAD_BYTES)
    if (isTarArchive(head)) {
      const entries = await listTarEntriesInFile(rawPath)
      const content = entries.find((entry) => entry.name === 'kobato.db')
      if (content === undefined) {
        throw new ActionFailure(400, descriptorFor('backup.error.missingContentDb'))
      }
      const contentPath = join(dir, 'kobato.db')
      await copyRange(rawPath, content.offset, content.size, contentPath)
      assertSqliteBackup(await readPrefix(contentPath, 16))
      let analyticsPath: string | null = null
      const analytics = entries.find((entry) => entry.name === 'analytics.duckdb')
      if (analytics !== undefined) {
        analyticsPath = join(dir, 'analytics.duckdb')
        await copyRange(rawPath, analytics.offset, analytics.size, analyticsPath)
        assertDuckdbBackup(await readPrefix(analyticsPath, 12))
      }
      let configPath: string | null = null
      const config = entries.find((entry) => entry.name === CONFIG_FILE_NAME)
      if (config !== undefined) {
        configPath = join(dir, CONFIG_FILE_NAME)
        await copyRange(rawPath, config.offset, config.size, configPath)
        await assertConfigBackup(configPath)
      }
      return { dir, content: contentPath, analytics: analyticsPath, config: configPath }
    }
    if (hasDuckdbMagic(head)) {
      const analyticsPath = join(dir, 'analytics.duckdb')
      await copyFile(rawPath, analyticsPath)
      return { dir, content: null, analytics: analyticsPath, config: null }
    }
    assertSqliteBackup(head)
    const contentPath = join(dir, 'kobato.db')
    await copyFile(rawPath, contentPath)
    return { dir, content: contentPath, analytics: null, config: null }
  } catch (error) {
    if (!(error instanceof EncryptedBackupPasswordRequired)) {
      rmSync(dir, { recursive: true, force: true })
    }
    throw error
  }
}

export async function sweepStaleRestoreDirs(): Promise<void> {
  let entries
  try {
    entries = await readdir(tmpdir(), { withFileTypes: true })
  } catch (error) {
    log.warn('Restore temp-dir sweep failed to read the temp dir', {
      err: error instanceof Error ? error.message : String(error),
    })
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(RESTORE_TEMP_PREFIX)) {
      continue
    }
    try {
      await rm(join(tmpdir(), entry.name), { recursive: true, force: true })
      log.info('Swept stale restore temp dir', { dir: entry.name })
    } catch (error) {
      log.warn('Failed to sweep stale restore temp dir', {
        dir: entry.name,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export async function assertStagedBackupContainsAdmin(staged: StagedBackup): Promise<void> {
  if (staged.content === null) {
    throw new ActionFailure(400, descriptorFor('backup.error.noAdmin'))
  }
  const db = new DatabaseSync(staged.content, { readOnly: true })
  try {
    const row: unknown = db
      .prepare(`SELECT count(*) AS admins FROM "user" WHERE "role" = 'admin' AND "deleted_at" IS NULL`)
      .get()
    const admins =
      row !== null && typeof row === 'object' && 'admins' in row && typeof row.admins === 'number' ? row.admins : 0
    if (admins < 1) {
      throw new ActionFailure(400, descriptorFor('backup.error.noAdmin'))
    }
  } finally {
    db.close()
  }
}

async function swapStagedFile(sourcePath: string, targetPath: string): Promise<void> {
  const stagingPath = `${targetPath}.restore-staging`
  const preRestorePath = `${targetPath}${PRE_RESTORE_SUFFIX}`
  let movedAside = false
  try {
    await copyFile(sourcePath, stagingPath)
    await rm(`${targetPath}-wal`, { force: true })
    await rm(`${targetPath}-shm`, { force: true })
    await rm(`${targetPath}.wal`, { force: true })
    await rename(targetPath, preRestorePath)
    movedAside = true
    await rename(stagingPath, targetPath)
  } catch (error) {
    await rm(stagingPath, { force: true })
    if (movedAside) {
      await rename(preRestorePath, targetPath).catch(() => undefined)
    }
    throw error
  }
}

const PRE_RESTORE_SUFFIX = '.pre-restore'
const RESTORE_STAGING_SUFFIX = '.restore-staging'

async function swapStagedConfig(sourcePath: string, targetPath: string): Promise<void> {
  const stagingPath = `${targetPath}${RESTORE_STAGING_SUFFIX}`
  const preRestorePath = `${targetPath}${PRE_RESTORE_SUFFIX}`
  try {
    await copyFile(sourcePath, stagingPath)
    await chmod(stagingPath, 0o600)
    await copyFile(targetPath, preRestorePath).catch((error: unknown) => {
      if (!isMissingFileError(error)) {
        throw error
      }
    })
    await rename(stagingPath, targetPath)
  } catch (error) {
    await rm(stagingPath, { force: true })
    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function engineTargets(): string[] {
  const targets: string[] = []
  const dbPath = resolveDatabasePath()
  if (!isInMemoryPath(dbPath)) {
    targets.push(dbPath)
  }
  const analyticsPath = resolveAnalyticsPath()
  if (!isInMemoryPath(analyticsPath)) {
    targets.push(analyticsPath)
  }
  return targets
}

function restoreTargets(): string[] {
  const targets = engineTargets()
  const configPath = resolveConfigFilePath()
  if (configPath !== null) {
    targets.push(configPath)
  }
  return targets
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function recoverPreRestoreFiles(): Promise<void> {
  for (const target of restoreTargets()) {
    const preRestorePath = `${target}${PRE_RESTORE_SUFFIX}`
    if (await pathExists(preRestorePath)) {
      if (await pathExists(target)) {
        await rm(preRestorePath, { force: true }).catch((error: unknown) => {
          log.warn('Failed to drop stale pre-restore sibling', {
            target,
            err: error instanceof Error ? error.message : String(error),
          })
        })
      } else {
        try {
          await rename(preRestorePath, target)
          log.warn('Recovered engine file from a crashed restore swap', { target })
        } catch (error: unknown) {
          log.error('Failed to recover engine file from pre-restore sibling', {
            target,
            err: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
    await rm(`${target}${RESTORE_STAGING_SUFFIX}`, { force: true }).catch(() => undefined)
  }
}

export async function rollbackPreRestoreFiles(): Promise<void> {
  for (const target of restoreTargets()) {
    const backupPath = `${target}${PRE_RESTORE_SUFFIX}`
    try {
      await access(backupPath)
    } catch {
      continue
    }
    try {
      // Windows cannot rename over an existing file — remove the swap first.
      await rm(target, { force: true })
      await rename(backupPath, target)
    } catch (error: unknown) {
      log.error('Restore rollback failed for engine file', {
        target,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export async function cleanupPreRestoreFiles(): Promise<void> {
  for (const target of restoreTargets()) {
    await rm(`${target}${PRE_RESTORE_SUFFIX}`, { force: true }).catch(() => undefined)
    await rm(`${target}${RESTORE_STAGING_SUFFIX}`, { force: true }).catch(() => undefined)
  }
}

async function discardSwapLeftovers(): Promise<void> {
  for (const target of restoreTargets()) {
    await rm(`${target}${PRE_RESTORE_SUFFIX}`, { force: true })
    await rm(`${target}${RESTORE_STAGING_SUFFIX}`, { force: true })
  }
}

export interface RestoreOptions {
  withAnalytics?: boolean
}

export interface RestoreResult {
  /** Takes effect only on the next process restart — config is a process-level snapshot. */
  configApplied: boolean
}

export async function restoreFromStagedBackup(
  staged: StagedBackup,
  fileName: string,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  const withAnalytics = options.withAnalytics ?? true
  log.info('Starting restore', {
    fileName,
    hasContent: staged.content !== null,
    hasAnalytics: staged.analytics !== null,
    hasConfig: staged.config !== null,
    withAnalytics,
  })
  if (staged.config !== null) {
    await assertConfigBackup(staged.config)
  }
  await discardSwapLeftovers()
  try {
    if (staged.content !== null) {
      const dbPath = resolveDatabasePath()
      if (isInMemoryPath(dbPath)) {
        throw new ActionFailure(400, descriptorFor('backup.error.memoryDb'))
      }
      await swapStagedFile(staged.content, dbPath)
    }
    if (staged.analytics !== null && withAnalytics) {
      const analyticsPath = resolveAnalyticsPath()
      if (isInMemoryPath(analyticsPath)) {
        log.warn('Restore: upload carries an analytics file but the sidecar is in-memory; skipping it')
      } else {
        await swapStagedFile(staged.analytics, analyticsPath)
      }
    }
    let configApplied = false
    if (staged.config !== null) {
      const configPath = resolveConfigFilePath()
      if (configPath === null) {
        log.warn('Restore: staged config present but this process has no config file (env-only mode); skipping it')
      } else {
        try {
          await swapStagedConfig(staged.config, configPath)
          configApplied = true
          log.info('Restore: config file replaced; it takes effect on the next process restart', { configPath })
        } catch (error) {
          log.warn('Restore: failed to write the restored config file', {
            configPath,
            err: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
    log.info('Restore completed successfully', { fileName, configApplied })
    return { configApplied }
  } finally {
    rmSync(staged.dir, { recursive: true, force: true })
  }
}
