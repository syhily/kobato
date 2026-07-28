import { rename, rm, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

import { assertSqliteBackup } from '@/server/domains/backup/services/shared'
import { resolveDatabasePath } from '@/server/infra/db/database'
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('backup.service')

const GZIP_MAGIC_1 = 0x1f
const GZIP_MAGIC_2 = 0x8b

/**
 * Unpack an uploaded/downloaded backup into a raw SQLite database file:
 * gunzip when the payload is gzipped (`.db.gz`, the `createBackup`
 * format), pass through when it already starts with the SQLite magic.
 */
export function extractBackupFile(buffer: Buffer): Buffer {
  const raw =
    buffer.length >= 2 && buffer[0] === GZIP_MAGIC_1 && buffer[1] === GZIP_MAGIC_2 ? gunzipSync(buffer) : buffer
  assertSqliteBackup(raw)
  return raw
}

/**
 * Stage the backup file next to the live database, then swap it in.
 * The caller (the restore orchestrator) has already closed the live
 * database handle — the swap is pure file ops: write the staging file,
 * remove the stale WAL/SHM sidecars, rename staging over the live path.
 * The reopen that follows replays migrations and restarts the server.
 */
export async function restoreFromBackup(buffer: Buffer, fileName: string): Promise<void> {
  const raw = extractBackupFile(buffer)
  const dbPath = resolveDatabasePath()
  if (dbPath === ':memory:') {
    throw new ActionFailure(400, '内存数据库不支持备份还原')
  }
  const stagingPath = `${dbPath}.restore-staging`

  log.info('Starting restore', { fileName, size: raw.length })
  try {
    await writeFile(stagingPath, raw)
    // Stale sidecars from the pre-close state must not outlive the swap.
    await rm(`${dbPath}-wal`, { force: true })
    await rm(`${dbPath}-shm`, { force: true })
    await rename(stagingPath, dbPath)
  } catch (error) {
    await rm(stagingPath, { force: true })
    throw error
  }
  log.info('Restore completed successfully', { fileName })
}
