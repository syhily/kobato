import { createReadStream, createWriteStream, mkdtempSync, rmSync } from 'node:fs'
import { copyFile, mkdtemp, open, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pipeline } from 'node:stream/promises'
import { createGunzip, gunzipSync } from 'node:zlib'

import {
  MAX_BACKUP_FILE_SIZE,
  assertDuckdbBackup,
  assertSqliteBackup,
  hasDuckdbMagic,
  hasSqliteMagic,
} from '@/server/domains/backup/services/shared'
import { isTarArchive, listTarEntriesInFile, unpackTar } from '@/server/domains/backup/services/tar'
import { resolveAnalyticsPath } from '@/server/infra/analytics/duckdb'
import { resolveDatabasePath } from '@/server/infra/db/database'
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('backup.service')

const GZIP_MAGIC_1 = 0x1f
const GZIP_MAGIC_2 = 0x8b
const HEAD_BYTES = 600

/**
 * Decompress an uploaded/downloaded backup payload: gunzip when the
 * payload is gzipped (the `createBackup` format), pass through when it
 * is already a raw archive/database file. In-memory, for small payloads
 * and tests — the production restore path streams decompression to
 * disk (`stageBackup`).
 */
export function extractBackupFile(buffer: Buffer): Buffer {
  return buffer.length >= 2 && buffer[0] === GZIP_MAGIC_1 && buffer[1] === GZIP_MAGIC_2 ? gunzipSync(buffer) : buffer
}

export interface BackupPayload {
  /** The SQLite content database — null on an analytics-only restore. */
  content: Buffer | null
  /** The DuckDB analytics sidecar — null when the upload carries none. */
  analytics: Buffer | null
}

/**
 * Unpack a decompressed backup into its engine payloads, in memory
 * (subarray views — no copies). Accepted shapes: the two-file tar
 * archive, a raw SQLite file (content-only), a raw DuckDB file
 * (analytics-only). Used by tests and the setup probe on small
 * payloads; production restores go through `stageBackup` instead.
 */
export function unpackBackupPayload(raw: Buffer): BackupPayload {
  if (isTarArchive(raw)) {
    const entries = unpackTar(raw)
    const content = entries.find((entry) => entry.name === 'kobato.db')
    if (content === undefined) {
      throw new ActionFailure(400, '备份归档中缺少内容数据库 kobato.db')
    }
    assertSqliteBackup(content.data)
    const analytics = entries.find((entry) => entry.name === 'analytics.duckdb')
    if (analytics !== undefined) {
      assertDuckdbBackup(analytics.data)
    }
    return { content: content.data, analytics: analytics?.data ?? null }
  }
  if (hasDuckdbMagic(raw)) {
    assertDuckdbBackup(raw)
    return { content: null, analytics: raw }
  }
  // Legacy content-only shape: raw SQLite bytes.
  assertSqliteBackup(raw)
  return { content: raw, analytics: null }
}

// ─── Staged (streaming) restore ──────────────────────────
// The production path: the upload (bounded at 500 MB by the multipart
// layer) streams to disk, decompresses through the pipeline, and tar
// entries extract via ranged reads — a full database file is never
// held in memory.

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

/**
 * Stage an uploaded backup on disk: stream it to a temp dir,
 * decompress through the pipeline, and extract the engine payloads as
 * files (magic-validated from their prefixes). Memory use stays
 * O(chunk) regardless of backup size. The caller owns `dir`'s cleanup
 * (restoreFromStagedBackup and the route's error paths handle it).
 */
export async function stageBackup(buffer: Buffer): Promise<StagedBackup> {
  const dir = await mkdtemp(join(tmpdir(), 'kobato-restore-'))
  const uploadPath = join(dir, 'upload.bin')
  const rawPath = join(dir, 'payload')
  try {
    await writeFile(uploadPath, buffer)
    if (buffer.length >= 2 && buffer[0] === GZIP_MAGIC_1 && buffer[1] === GZIP_MAGIC_2) {
      await pipeline(createReadStream(uploadPath), createGunzip(), createWriteStream(rawPath))
    } else {
      await copyFile(uploadPath, rawPath)
    }
    const { size } = await stat(rawPath)
    if (size > MAX_BACKUP_FILE_SIZE) {
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
      if (!hasSqliteMagic(await readPrefix(contentPath, 16))) {
        throw new ActionFailure(400, '备份归档中的 kobato.db 不是有效的 SQLite 数据库文件')
      }
      let analyticsPath: string | null = null
      const analytics = entries.find((entry) => entry.name === 'analytics.duckdb')
      if (analytics !== undefined) {
        analyticsPath = join(dir, 'analytics.duckdb')
        await copyRange(rawPath, analytics.offset, analytics.size, analyticsPath)
        if (!hasDuckdbMagic(await readPrefix(analyticsPath, 12))) {
          throw new ActionFailure(400, '备份归档中的 analytics.duckdb 不是有效的 DuckDB 数据库文件')
        }
      }
      return { dir, content: contentPath, analytics: analyticsPath }
    }
    if (hasDuckdbMagic(head)) {
      const analyticsPath = join(dir, 'analytics.duckdb')
      await copyFile(rawPath, analyticsPath)
      return { dir, content: null, analytics: analyticsPath }
    }
    if (!hasSqliteMagic(head)) {
      throw new ActionFailure(400, '备份文件不是有效的 SQLite 数据库文件')
    }
    const contentPath = join(dir, 'kobato.db')
    await copyFile(rawPath, contentPath)
    return { dir, content: contentPath, analytics: null }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}

/**
 * Pre-swap content check for the setup restore: the backup must contain
 * an admin row (the install gate counts `role = 'admin' AND deleted_at
 * IS NULL`). Reads the STAGED content file — the live database is
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

/** Buffer-based variant for tests and small payloads. */
export async function assertBackupContainsAdmin(buffer: Buffer): Promise<void> {
  const { content } = unpackBackupPayload(extractBackupFile(buffer))
  if (content === null) {
    throw new ActionFailure(400, '备份中不包含管理员账号')
  }
  const dir = mkdtempSync(join(tmpdir(), 'kobato-restore-check-'))
  try {
    const probe = join(dir, 'probe.db')
    await writeFile(probe, content)
    await assertStagedBackupContainsAdmin({ dir, content: probe, analytics: null })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Move a staged engine file into place over the live one. The owning
 *  handle is already closed (the restore machine's prepare step) — the
 *  swap is a staged copy + atomic rename + sidecar cleanup. */
async function swapStagedFile(sourcePath: string, targetPath: string): Promise<void> {
  const stagingPath = `${targetPath}.restore-staging`
  try {
    await copyFile(sourcePath, stagingPath)
    await rm(`${targetPath}-wal`, { force: true })
    await rm(`${targetPath}-shm`, { force: true })
    await rm(`${targetPath}.wal`, { force: true })
    await rename(stagingPath, targetPath)
  } catch (error) {
    await rm(stagingPath, { force: true })
    throw error
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
      if (dbPath === ':memory:') {
        throw new ActionFailure(400, '内存数据库不支持备份还原')
      }
      await swapStagedFile(staged.content, dbPath)
    }
    if (staged.analytics !== null && withAnalytics) {
      const analyticsPath = resolveAnalyticsPath()
      if (analyticsPath !== ':memory:') {
        await swapStagedFile(staged.analytics, analyticsPath)
      } else {
        log.warn('Restore: upload carries an analytics file but the sidecar is in-memory; skipping it')
      }
    }
    log.info('Restore completed successfully', { fileName })
  } finally {
    rmSync(staged.dir, { recursive: true, force: true })
  }
}

/** Buffer-in convenience wrapper (admin + upload restore paths). */
export async function restoreFromBackup(buffer: Buffer, fileName: string, options: RestoreOptions = {}): Promise<void> {
  const staged = await stageBackup(buffer)
  try {
    await restoreFromStagedBackup(staged, fileName, options)
  } catch (error) {
    rmSync(staged.dir, { recursive: true, force: true })
    throw error
  }
}
