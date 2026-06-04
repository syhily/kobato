import { MAX_SQL_SIZE } from '@/server/domains/backup/services/shared'
import { ActionFailure } from '@/server/infra/http/errors'

// Dangerous SQL patterns that must never be allowed in a restore file.
const BLOCKED_PATTERNS = [
  /\bDROP\s+(?:\/\*[^]*?\*\/\s*)*DATABASE\b/i,
  /\bALTER\s+(?:\/\*[^]*?\*\/\s*)*ROLE\b/i,
  /\bDROP\s+(?:\/\*[^]*?\*\/\s*)*ROLE\b/i,
  /\bALTER\s+(?:\/\*[^]*?\*\/\s*)*SYSTEM\b/i,
  /\bCOPY\b[^\n;]*?\bTO\b[^\n;]*?\bPROGRAM\b/i,
  /\bCREATE\s+(?:\/\*[^]*?\*\/\s*)*DATABASE\b/i,
  /\bCREATE\s+(?:\/\*[^]*?\*\/\s*)*FUNCTION\b/i,
  /\bCREATE\s+(?:\/\*[^]*?\*\/\s*)*PROCEDURE\b/i,
  /\bCREATE\s+(?:\/\*[^]*?\*\/\s*)*EXTENSION\b/i,
  /\bLANGUAGE\s+(?:\/\*[^]*?\*\/\s*)*(plpython3u|plperlu|pltclu|plsh|plc|pljava|plr)\b/i,
  /\bDO\s*\$\$/i,
  /\\!/i,
  /\\i\b/i,
  /\\include\b/i,
  /\\copy\b/i,
  /\\lo_import\b/i,
  /\\lo_export\b/i,
  /\\c\b/i,
  /\\connect\b/i,
  /\\o\b/i,
]

// Allowed statement prefixes. Every non-comment, non-empty line must start
// with one of these. This complements the blocklist with a defence-in-depth
// allowlist so only pg_dump-generated statements can pass.
const ALLOWED_PREFIXES = [
  'SET',
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'COPY',
  'CREATE',
  'ALTER',
  'DROP',
  'GRANT',
  'REVOKE',
  'COMMENT ON',
  'BEGIN',
  'COMMIT',
  'SAVEPOINT',
  'RELEASE',
  'TRUNCATE',
]

const ALLOWED_PREFIX_RE = new RegExp(
  `^\\s*(?:${ALLOWED_PREFIXES.map((p) => p.replace(/\s/g, '\\s+')).join('|')})\\b`,
  'i',
)

const COMMENT_OR_EMPTY_RE = /^\s*(?:--.*)?$/

function containsDisallowedStatements(sql: string): boolean {
  for (const line of sql.split('\n')) {
    if (COMMENT_OR_EMPTY_RE.test(line)) {
      continue
    }
    if (!ALLOWED_PREFIX_RE.test(line)) {
      return true
    }
  }
  return false
}

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
  if (containsDisallowedStatements(sql)) {
    throw new ActionFailure(400, '备份文件包含不允许的 SQL 语句类型，还原已中止。')
  }
}
