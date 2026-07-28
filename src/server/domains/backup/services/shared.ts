import { ActionFailure } from '@/server/infra/http/errors'

// Decompressed backup size cap: 500 MB.
export const MAX_BACKUP_FILE_SIZE = 500 * 1024 * 1024

/** The 16-byte magic header every SQLite database file starts with. */
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1')

/**
 * Validate a (decompressed) backup payload as a real SQLite database
 * file. This is the entire restore-file security surface: unlike the old
 * pg_dump SQL restores — which needed a statement-level validator —
 * a database file is data, not code; nothing in it is ever executed as
 * SQL by the restore path.
 */
export function assertSqliteBackup(buffer: Buffer): void {
  if (buffer.length > MAX_BACKUP_FILE_SIZE) {
    throw new ActionFailure(400, '备份文件过大，请确认文件未损坏。')
  }
  if (buffer.length < SQLITE_MAGIC.length || !buffer.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) {
    throw new ActionFailure(400, '备份文件不是有效的 SQLite 数据库文件')
  }
}
