import { mkdtempSync, rmSync } from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { gunzipSync } from 'node:zlib'

import { assertDuckdbBackup, assertSqliteBackup } from '@/server/domains/backup/services/shared'
import { isTarArchive, unpackTar } from '@/server/domains/backup/services/tar'
import { resolveAnalyticsPath } from '@/server/infra/analytics/duckdb'
import { resolveDatabasePath } from '@/server/infra/db/database'
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('backup.service')

const GZIP_MAGIC_1 = 0x1f
const GZIP_MAGIC_2 = 0x8b

/**
 * Decompress an uploaded/downloaded backup payload: gunzip when the
 * payload is gzipped (the `createBackup` format), pass through when it
 * is already a raw archive/database file. Content validation lives in
 * `unpackBackupPayload` — extraction is deliberately only the
 * decompression so a route can extract once and thread the payload
 * through validation and the swap.
 */
export function extractBackupFile(buffer: Buffer): Buffer {
  return buffer.length >= 2 && buffer[0] === GZIP_MAGIC_1 && buffer[1] === GZIP_MAGIC_2 ? gunzipSync(buffer) : buffer
}

export interface BackupPayload {
  /** The SQLite content database. */
  content: Buffer
  /** The DuckDB analytics sidecar — null for legacy content-only backups. */
  analytics: Buffer | null
}

/**
 * Unpack a decompressed backup into its engine payloads. Two accepted
 * shapes: the two-file tar archive (`kobato.db` + `analytics.duckdb`,
 * the current `createBackup` format) and the legacy single-file raw
 * SQLite backup (content only — stays restorable). Every entry is
 * magic-validated before it is trusted.
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
  // Legacy content-only shape: raw SQLite bytes.
  assertSqliteBackup(raw)
  return { content: raw, analytics: null }
}

/**
 * Pre-swap content check for the setup restore: the backup must contain
 * an admin row (the install gate counts `role = 'admin' AND deleted_at
 * IS NULL`). Runs against a THROWAWAY temp file — the live database is
 * untouched, so this can run before the restore slot is even claimed.
 * Post-swap validation would be too late: by then the original file no
 * longer exists.
 */
export async function assertBackupContainsAdmin(buffer: Buffer): Promise<void> {
  const { content } = unpackBackupPayload(extractBackupFile(buffer))
  const dir = mkdtempSync(join(tmpdir(), 'kobato-restore-check-'))
  try {
    const probe = join(dir, 'probe.db')
    await writeFile(probe, content)
    const db = new DatabaseSync(probe, { readOnly: true })
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
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Write `data` next to `targetPath`, then atomically swap it in. The
 * caller (the restore machine) has already closed the owning handle —
 * the swap is pure file ops: write the staging file, remove stale
 * WAL/SHM sidecars, rename staging over the live path.
 */
async function swapFile(targetPath: string, data: Buffer): Promise<void> {
  const stagingPath = `${targetPath}.restore-staging`
  try {
    await writeFile(stagingPath, data)
    await rm(`${targetPath}-wal`, { force: true })
    await rm(`${targetPath}-shm`, { force: true })
    await rm(`${targetPath}.wal`, { force: true })
    await rename(stagingPath, targetPath)
  } catch (error) {
    await rm(stagingPath, { force: true })
    throw error
  }
}

/**
 * Restore both engine files from a backup payload. The content database
 * always swaps; the DuckDB sidecar swaps when the archive carries it
 * (current format) — legacy content-only backups leave the sidecar to
 * rebuild from empty. The reopen that follows replays migrations and
 * restarts the server.
 */
export async function restoreFromBackup(buffer: Buffer, fileName: string): Promise<void> {
  const payload = unpackBackupPayload(extractBackupFile(buffer))
  const dbPath = resolveDatabasePath()
  if (dbPath === ':memory:') {
    throw new ActionFailure(400, '内存数据库不支持备份还原')
  }

  log.info('Starting restore', {
    fileName,
    contentBytes: payload.content.length,
    hasAnalytics: payload.analytics !== null,
  })
  await swapFile(dbPath, payload.content)

  if (payload.analytics !== null) {
    const analyticsPath = resolveAnalyticsPath()
    if (analyticsPath !== ':memory:') {
      await swapFile(analyticsPath, payload.analytics)
    } else {
      log.warn('Restore: archive carries an analytics file but the sidecar is in-memory; skipping it')
    }
  }
  log.info('Restore completed successfully', { fileName })
}
