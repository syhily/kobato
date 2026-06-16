import { MAX_SQL_SIZE } from '@/server/domains/backup/services/shared'
import { ActionFailure } from '@/server/infra/http/errors'

// Project-specific marker emitted by createBackup and required on restore.
export const BACKUP_HEADER_MARKER = '-- Kobato database backup'

// Dangerous SQL patterns that must never be allowed in a restore file.
const BLOCKED_PATTERNS = [
  /\bDROP\s+(?:\/\*[^]*?\*\/\s*)*DATABASE\b/i,
  /\bALTER\s+(?:\/\*[^]*?\*\/\s*)*ROLE\b/i,
  /\bDROP\s+(?:\/\*[^]*?\*\/\s*)*ROLE\b/i,
  /\bALTER\s+(?:\/\*[^]*?\*\/\s*)*SYSTEM\b/i,
  /\bCOPY\b[\s\S]*?\bTO\b[\s\S]*?\bPROGRAM\b/i,
  /\bCOPY\b[\s\S]*?\bTO\b[\s\S]*?;/i,
  /\bCREATE\s+(?:\/\*[^]*?\*\/\s*)*DATABASE\b/i,
  /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:\/\*[^]*?\*\/\s*)*FUNCTION\b/i,
  /\bCREATE\s+(?:\/\*[^]*?\*\/\s*)*PROCEDURE\b/i,
  /\bLANGUAGE\s+(?:\/\*[^]*?\*\/\s*)*(plpython3u|plperlu|pltclu|plsh|plc|pljava|plr)\b/i,
  /\bSECURITY\s+DEFINER\b/i,
  /\bEXECUTE\b[\s\S]*?\|\|[\s\S]*?;/i,
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
  /\\du\b/i,
  /\\dp\b/i,
]

// Extensions that are safe to CREATE EXTENSION in a restore file.
// This replaces the blanket CREATE EXTENSION block so that standard pg_dump
// output (which includes extensions like vector, timescaledb, etc.) can pass,
// while still rejecting known dangerous extensions.
const ALLOWED_EXTENSIONS = new Set([
  // Project-required
  'vector',
  'timescaledb',
  'timescaledb_toolkit',
  // Built-in / widely-used safe extensions
  'pg_trgm',
  'uuid-ossp',
  'uuid_ossp',
  'pgcrypto',
  'citext',
  'hstore',
  'unaccent',
  'intarray',
  'ltree',
  'cube',
  'earthdistance',
  'fuzzystrmatch',
  'tablefunc',
  'dict_xsyn',
  'dict_int',
  'pg_stat_statements',
  'auto_explain',
  'pg_prewarm',
  'pg_buffercache',
  'pg_freespacemap',
  'pg_visibility',
  'pageinspect',
  'amcheck',
  'bloom',
  'hypopg',
  'postgis',
  'postgis_topology',
  'postgis_raster',
  'postgis_tiger_geocoder',
  'address_standardizer',
])

const CREATE_EXTENSION_RE =
  /\bCREATE\s+(?:\/\*[^]*?\*\/\s*)*EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_-]+)"?/gi

function containsBlockedExtensions(sql: string): boolean {
  // Reset global regex state so repeated validations are deterministic.
  CREATE_EXTENSION_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CREATE_EXTENSION_RE.exec(sql)) !== null) {
    const ext = match[1].toLowerCase().replace(/-/g, '_')
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return true
    }
  }
  return false
}

// Allowed statement prefixes. Every complete SQL statement must start with
// one of these. This complements the blocklist with a defence-in-depth
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
  'END',
  'SAVEPOINT',
  'RELEASE',
  'TRUNCATE',
]

const COMMENT_OR_EMPTY_RE = /^\s*(?:--.*)?$/
const COPY_FROM_STDIN_RE = /^\s*COPY\b[^\n]*\bFROM\b[^\n]*\bstdin\b/i
const COPY_END_RE = /^\\\.$/
// pg_dump 17.6+ wraps dumps in \restrict / \unrestrict to prevent malicious
// psql meta-commands from executing during restore. These are structural
// markers, not SQL statements, and should be skipped.
const RESTRICT_RE = /^\\restrict\b/
const UNRESTRICT_RE = /^\\unrestrict\b/

/**
 * Split SQL into individual statements, skipping COPY data blocks,
 * comments, and pg_dump \restrict / \unrestrict markers. Handles multi-line
 * DDL (CREATE TABLE, CREATE TYPE, etc.) and semicolons inside single-quoted
 * strings.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inString = false
  let inCopyBlock = false

  for (const rawLine of sql.split('\n')) {
    const line = rawLine.trimEnd()
    if (COMMENT_OR_EMPTY_RE.test(line)) {
      continue
    }

    const trimmedLine = line.trim()
    if (RESTRICT_RE.test(trimmedLine) || UNRESTRICT_RE.test(trimmedLine)) {
      continue
    }

    if (inCopyBlock) {
      if (COPY_END_RE.test(trimmedLine)) {
        inCopyBlock = false
      }
      continue
    }

    if (COPY_FROM_STDIN_RE.test(line)) {
      inCopyBlock = true
      continue
    }

    const trimmed = line.trim()
    if (current) {
      current += ' '
    }
    current += trimmed

    // Track single-quoted strings so we don't split on semicolons inside them.
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i]
      if (ch === "'") {
        if (inString && i + 1 < trimmed.length && trimmed[i + 1] === "'") {
          i++ // skip escaped quote ''
        } else {
          inString = !inString
        }
      }
    }

    if (!inString && trimmed.endsWith(';')) {
      statements.push(current)
      current = ''
    }
  }

  if (current.trim()) {
    statements.push(current)
  }

  return statements
}

/**
 * Remove SQL comments while preserving single-quoted string literals.
 * Used before statement-level security checks so comment obfuscation
 * (e.g. SET ROLE with an inline block comment) cannot bypass the validator.
 */
function normalizeStatement(stmt: string): string {
  let result = ''
  let i = 0
  while (i < stmt.length) {
    const ch = stmt[i]
    const next = stmt[i + 1]

    if (ch === "'") {
      result += ch
      i++
      while (i < stmt.length) {
        result += stmt[i]
        if (stmt[i] === "'") {
          if (stmt[i + 1] === "'") {
            result += stmt[i + 1]
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }

    if (ch === '-' && next === '-') {
      while (i < stmt.length && stmt[i] !== '\n') {
        i++
      }
      result += ' '
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (i < stmt.length - 1 && (stmt[i] !== '*' || stmt[i + 1] !== '/')) {
        i++
      }
      i += 2
      result += ' '
      continue
    }

    result += ch
    i++
  }

  return result.replace(/\s+/g, ' ').trim().toUpperCase()
}

function isAllowedPrefix(normalized: string): boolean {
  for (const prefix of ALLOWED_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return true
    }
  }
  return false
}

function isDangerousStatement(normalized: string): boolean {
  // Block non-stdin COPY FROM (file path or PROGRAM).
  if (/^COPY\b/i.test(normalized) && /\bFROM\b/i.test(normalized) && !/\bFROM\s+STDIN\b/i.test(normalized)) {
    return true
  }

  // Block privilege escalation via SET/RESET ROLE or SESSION AUTHORIZATION.
  if (/^SET\s+ROLE\b/i.test(normalized)) {
    return true
  }
  if (/^SET\s+SESSION\s+AUTHORIZATION\b/i.test(normalized)) {
    return true
  }
  if (/^RESET\s+ROLE\b/i.test(normalized)) {
    return true
  }
  if (/^RESET\s+SESSION\s+AUTHORIZATION\b/i.test(normalized)) {
    return true
  }

  // Block dangerous GRANT/REVOKE (role membership or broad ALL PRIVILEGES).
  if (/^(GRANT|REVOKE)\b/i.test(normalized)) {
    if (/\b(ON\s+ROLE|TO\s+GROUP|FROM\s+GROUP)\b/i.test(normalized)) {
      return true
    }
    if (
      /\bALL\s+(?:PRIVILEGES\s+)?ON\s+(DATABASE|SCHEMA|ALL\s+(?:TABLES|SEQUENCES|FUNCTIONS|PROCEDURES|ROUTINES))\b/i.test(
        normalized,
      )
    ) {
      return true
    }
  }

  // Block executable server-side objects that can run arbitrary SQL.
  if (/^CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\b/i.test(normalized)) {
    return true
  }
  if (/^CREATE\s+(?:OR\s+REPLACE\s+)?RULE\b/i.test(normalized)) {
    return true
  }
  if (/^CREATE\s+EVENT\s+TRIGGER\b/i.test(normalized)) {
    return true
  }

  // Block standalone EXECUTE statements.
  if (/^EXECUTE\b/i.test(normalized)) {
    return true
  }

  return false
}

function containsDisallowedStatements(sql: string): boolean {
  const statements = splitStatements(sql)
  for (const stmt of statements) {
    const normalized = normalizeStatement(stmt)
    if (!normalized) {
      continue
    }
    if (!isAllowedPrefix(normalized)) {
      return true
    }
    if (isDangerousStatement(normalized)) {
      return true
    }
  }
  return false
}

export function validateBackupHeader(sql: string): void {
  if (!sql.includes(BACKUP_HEADER_MARKER)) {
    throw new ActionFailure(400, '备份文件缺少项目签名，无法确认来源。')
  }
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
  if (containsBlockedExtensions(sql)) {
    throw new ActionFailure(400, '备份文件包含不允许的数据库扩展，还原已中止。')
  }
  if (containsDisallowedStatements(sql)) {
    throw new ActionFailure(400, '备份文件包含不允许的 SQL 语句类型，还原已中止。')
  }
}
