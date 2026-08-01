import type { Readable } from 'node:stream'

import { createReadStream, createWriteStream, rmSync } from 'node:fs'
import { copyFile, mkdtemp, access, open, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import { isTarArchive, listTarEntriesInFile } from '@/server/domains/backup/services/tar'
import { resolveAnalyticsPath } from '@/server/infra/analytics/duckdb'
import { isInMemoryPath, resolveDatabasePath } from '@/server/infra/db/database'
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('backup.service')

// Decompressed backup size cap: 500 MB.
export const MAX_BACKUP_FILE_SIZE = 500 * 1024 * 1024

/** The 16-byte magic header every SQLite database file starts with. */
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1')

/** DuckDB's storage magic: 4 ASCII bytes after the 8-byte checksum. */
const DUCKDB_MAGIC_OFFSET = 8
const DUCKDB_MAGIC = 'DUCK'

const GZIP_MAGIC_1 = 0x1f
const GZIP_MAGIC_2 = 0x8b
const HEAD_BYTES = 600

/** The mkdtemp prefix every staged-restore temp dir carries — the
 *  boot-time sweep keys on it (and nothing else may). */
export const RESTORE_TEMP_PREFIX = 'kobato-restore-'

/** Whether a (prefix of a) payload starts with the SQLite header magic. */
export function hasSqliteMagic(buffer: Buffer): boolean {
  return buffer.length >= SQLITE_MAGIC.length && buffer.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)
}

/** Whether a (prefix of a) payload carries DuckDB's storage magic. */
export function hasDuckdbMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= DUCKDB_MAGIC_OFFSET + DUCKDB_MAGIC.length &&
    buffer.subarray(DUCKDB_MAGIC_OFFSET, DUCKDB_MAGIC_OFFSET + DUCKDB_MAGIC.length).toString('latin1') === DUCKDB_MAGIC
  )
}

/**
 * Validate a (decompressed) payload as a real SQLite database file.
 * This is the entire restore-file security surface: unlike the old
 * pg_dump SQL restores — which needed a statement-level validator —
 * a database file is data, not code; nothing in it is ever executed as
 * SQL by the restore path.
 */
export function assertSqliteBackup(buffer: Buffer): void {
  if (buffer.length > MAX_BACKUP_FILE_SIZE) {
    throw new ActionFailure(400, '备份文件过大，请确认文件未损坏。')
  }
  if (!hasSqliteMagic(buffer)) {
    throw new ActionFailure(400, '备份文件不是有效的 SQLite 数据库文件')
  }
}

/** Validate a payload as a real DuckDB database file (the analytics sidecar). */
export function assertDuckdbBackup(buffer: Buffer): void {
  if (!hasDuckdbMagic(buffer)) {
    throw new ActionFailure(400, '备份归档中的 analytics.duckdb 不是有效的 DuckDB 数据库文件')
  }
}

// ─── Staged (streaming) restore ──────────────────────────
// The production path: the upload (bounded at MAX_BACKUP_FILE_SIZE by
// the multipart layer) streams to disk, decompresses through the
// pipeline, and tar entries extract via ranged reads — a full database
// file is never held in memory. The in-memory buffer tier
// (extractBackupFile / unpackBackupPayload / packTar / unpackTar) lives
// in tests/_helpers/backup-buffer.ts.

export interface StagedBackup {
  /** Temp dir holding the decompressed payload + extracted entries. */
  dir: string
  /** Extracted content file path (inside `dir`), null for analytics-only uploads. */
  content: string | null
  /** Extracted analytics file path, null when the upload carries none. */
  analytics: string | null
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
  await pipeline(createReadStream(sourcePath, { start: offset, end: offset + size - 1 }), createWriteStream(destPath))
}

/** Transform that fails the pipeline once the byte count passing through
 *  exceeds `maxBytes` — exported so the streaming cap can be unit-tested
 *  with a small bound instead of a real 500MB payload. */
export function decompressedSizeGuard(maxBytes: number): Transform {
  let total = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      if (total > maxBytes) {
        callback(new ActionFailure(400, '备份文件过大，请确认文件未损坏。'))
        return
      }
      callback(null, chunk)
    },
  })
}

/**
 * Stage an uploaded backup on disk: stream it to a temp dir,
 * decompress through the pipeline, and extract the engine payloads as
 * files (magic-validated from their prefixes). Memory use stays
 * O(chunk) regardless of backup size — the source may be a download or
 * multipart stream (production) or a Buffer (tests). The caller owns
 * `dir`'s cleanup (restoreFromStagedBackup and the route's error paths
 * handle it). `maxBytes` caps the DECOMPRESSED payload; tests pass a
 * small value to exercise the streaming guard without a real 500MB file.
 */
export async function stageBackup(source: Buffer | Readable, maxBytes = MAX_BACKUP_FILE_SIZE): Promise<StagedBackup> {
  const dir = await mkdtemp(join(tmpdir(), RESTORE_TEMP_PREFIX))
  const uploadPath = join(dir, 'upload.bin')
  const rawPath = join(dir, 'payload')
  try {
    if (Buffer.isBuffer(source)) {
      await writeFile(uploadPath, source)
    } else {
      await pipeline(source, createWriteStream(uploadPath))
    }
    const magic = await readPrefix(uploadPath, 2)
    if (magic.length >= 2 && magic[0] === GZIP_MAGIC_1 && magic[1] === GZIP_MAGIC_2) {
      // Count decompressed bytes in-stream and abort the moment the cap
      // trips — a gzip bomb must not be written to disk in full first
      // (the old decompress-then-stat flow allowed exactly that).
      await pipeline(
        createReadStream(uploadPath),
        createGunzip(),
        decompressedSizeGuard(maxBytes),
        createWriteStream(rawPath),
      )
    } else {
      await copyFile(uploadPath, rawPath)
    }
    const { size } = await stat(rawPath)
    if (size > maxBytes) {
      throw new ActionFailure(400, '备份文件过大，请确认文件未损坏。')
    }

    const head = await readPrefix(rawPath, HEAD_BYTES)
    if (isTarArchive(head)) {
      const entries = await listTarEntriesInFile(rawPath)
      const content = entries.find((entry) => entry.name === 'kobato.db')
      if (content === undefined) {
        throw new ActionFailure(400, '备份归档中缺少内容数据库 kobato.db')
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
      return { dir, content: contentPath, analytics: analyticsPath }
    }
    if (hasDuckdbMagic(head)) {
      const analyticsPath = join(dir, 'analytics.duckdb')
      await copyFile(rawPath, analyticsPath)
      return { dir, content: null, analytics: analyticsPath }
    }
    assertSqliteBackup(head)
    const contentPath = join(dir, 'kobato.db')
    await copyFile(rawPath, contentPath)
    return { dir, content: contentPath, analytics: null }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}

/**
 * Boot-time sweep for staged-restore temp dirs orphaned by a process
 * crash mid-restore (the in-chain cleanups can't run when the process
 * dies). Deletes ONLY directories directly inside the OS temp dir whose
 * names carry the exact mkdtemp prefix — files and unrelated
 * directories are left alone. Best-effort per entry: one unreadable
 * leftover never blocks the rest.
 */
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

/**
 * Pre-swap content check for BOTH restore routes (admin upload-restore
 * and setup restore): the backup must contain an admin row — restoring
 * one without an admin soft-locks the instance behind the install gate,
 * and a payload that passes the magic check but cannot be opened as a
 * real database fails HERE (DatabaseSync open + a real query), not
 * after the swap. Reads the STAGED content file — the live database is
 * untouched, so this can run before the restore slot is even claimed.
 * Post-swap validation would be too late: by then the original file no
 * longer exists.
 */
export async function assertStagedBackupContainsAdmin(staged: StagedBackup): Promise<void> {
  if (staged.content === null) {
    throw new ActionFailure(400, '备份中不包含管理员账号')
  }
  const db = new DatabaseSync(staged.content, { readOnly: true })
  try {
    const row: unknown = db
      .prepare(`SELECT count(*) AS admins FROM "user" WHERE "role" = 'admin' AND "deleted_at" IS NULL`)
      .get()
    const admins =
      row !== null && typeof row === 'object' && 'admins' in row && typeof row.admins === 'number' ? row.admins : 0
    if (admins < 1) {
      throw new ActionFailure(400, '备份中不包含管理员账号')
    }
  } finally {
    db.close()
  }
}

/** Move a staged engine file into place over the live one. The owning
 *  handle is already closed (the restore machine's prepare step) — the
 *  swap is a staged copy + atomic rename + sidecar cleanup. The live
 *  file is first moved aside to `<target>.pre-restore` (never deleted
 *  in place): if the chain fails AFTER the swap — e.g. the swapped-in
 *  payload passes the magic check but cannot be opened — the
 *  completion handler rolls the original back
 *  (`rollbackPreRestoreFiles`) instead of restarting into a corrupt
 *  database with no way home. */
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
      // The swap never completed — put the original back.
      await rename(preRestorePath, targetPath).catch(() => undefined)
    }
    throw error
  }
}

/** Sibling suffix of the original files kept by the swap. */
const PRE_RESTORE_SUFFIX = '.pre-restore'

/** Live engine files the swap touches (skipped when in-memory). */
function swapTargets(): string[] {
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

/**
 * Roll the pre-restore originals back over the swapped files. Called by
 * the restore completion handler on the FAILURE path, BEFORE the
 * recovery reopen — reopening the (corrupt) swapped payload again
 * would leave the server wedged in `restarting` with the original
 * already gone. Best-effort per file: a missing `.pre-restore` sibling
 * (analytics-only upload, in-memory target) is simply skipped.
 */
export async function rollbackPreRestoreFiles(): Promise<void> {
  for (const target of swapTargets()) {
    const backupPath = `${target}${PRE_RESTORE_SUFFIX}`
    try {
      await access(backupPath)
    } catch {
      // No original kept for this target (analytics-only upload,
      // in-memory target, content skipped) — nothing to roll back,
      // and the live file must NOT be touched.
      continue
    }
    try {
      // Windows cannot rename over an existing file — remove the bad
      // swap first (POSIX would atomically replace).
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

/**
 * Delete the pre-restore originals after a SUCCESSFUL restore chain
 * (reopened + migrated + restarted on the new files). Best-effort —
 * leftovers are inert siblings, cleaned on the next restore.
 */
export async function cleanupPreRestoreFiles(): Promise<void> {
  for (const target of swapTargets()) {
    await rm(`${target}${PRE_RESTORE_SUFFIX}`, { force: true }).catch(() => undefined)
  }
}

export interface RestoreOptions {
  /**
   * Apply the analytics payload when the upload carries one (default
   * true). The SETUP restore passes false: a fresh install applies the
   * content database only — there is no reason to inherit an old
   * site's telemetry before the first admin exists.
   */
  withAnalytics?: boolean
}

/**
 * Swap the staged engine files into place (and clean the temp dir).
 * The content database swaps when present (skipped on an analytics-only
 * upload); the sidecar swaps when the upload carries it AND
 * `withAnalytics` is on. The reopen that follows replays migrations
 * and restarts the server.
 */
export async function restoreFromStagedBackup(
  staged: StagedBackup,
  fileName: string,
  options: RestoreOptions = {},
): Promise<void> {
  const withAnalytics = options.withAnalytics ?? true
  log.info('Starting restore', {
    fileName,
    hasContent: staged.content !== null,
    hasAnalytics: staged.analytics !== null,
    withAnalytics,
  })
  try {
    if (staged.content !== null) {
      const dbPath = resolveDatabasePath()
      if (isInMemoryPath(dbPath)) {
        throw new ActionFailure(400, '内存数据库不支持备份还原')
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
    log.info('Restore completed successfully', { fileName })
  } finally {
    rmSync(staged.dir, { recursive: true, force: true })
  }
}
