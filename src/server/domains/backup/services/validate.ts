import { MAX_SQL_SIZE } from '@/server/domains/backup/services/shared'
import { ActionFailure } from '@/server/infra/http/errors'

// Dangerous SQL patterns that must never be allowed in a restore file.
const BLOCKED_PATTERNS = [
  /\bDROP\s+(?:\/\*[^]*?\*\/\s*)*DATABASE\b/i,
  /\bALTER\s+(?:\/\*[^]*?\*\/\s*)*ROLE\b/i,
  /\bDROP\s+(?:\/\*[^]*?\*\/\s*)*ROLE\b/i,
  /\bALTER\s+(?:\/\*[^]*?\*\/\s*)*SYSTEM\b/i,
  /\bCOPY\b[^\n;]*?\bTO\b[^\n;]*?\bPROGRAM\b/i,
  /\\!/i,
  /\\i\b/i,
  /\\include\b/i,
  /\\copy\b/i,
  /\\lo_import\b/i,
  /\\lo_export\b/i,
  /\\c\b/i,
  /\\o\b/i,
]

export function validateBackupSql(sql: string): void {
  if (sql.length > MAX_SQL_SIZE) {
    throw new ActionFailure(400, '备份文件过大，请确认文件未损坏。')
  }
  const hasPgDumpHeader = /PostgreSQL database dump/i.test(sql)
  const hasCreateTable = /CREATE\s+TABLE/i.test(sql)
  const hasInsert = /INSERT\s+INTO/i.test(sql)
  if (!hasPgDumpHeader && !hasCreateTable && !hasInsert) {
    throw new ActionFailure(400, '备份文件内容不符合数据库备份格式')
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(sql)) {
      throw new ActionFailure(400, `备份文件包含危险 SQL 命令（匹配：${pattern.source}），还原已中止。`)
    }
  }
}
