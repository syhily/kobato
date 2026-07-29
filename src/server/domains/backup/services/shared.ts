import { ActionFailure } from '@/server/infra/http/errors'

// Decompressed backup size cap: 500 MB.
export const MAX_BACKUP_FILE_SIZE = 500 * 1024 * 1024

/** The 16-byte magic header every SQLite database file starts with. */
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1')

/** DuckDB's storage magic: 4 ASCII bytes after the 8-byte checksum. */
const DUCKDB_MAGIC_OFFSET = 8
const DUCKDB_MAGIC = 'DUCK'

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
