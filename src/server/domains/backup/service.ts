import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql as drizzleSql } from 'drizzle-orm'
import { execFile, spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { createGunzip, createGzip } from 'node:zlib'

import { DATABASE_URL, processEnv } from '@/server/infra/env'
import { ActionFailure, DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import {
  deleteS3Object,
  deleteS3Objects,
  getS3ObjectBuffer,
  listS3Objects,
  listS3ObjectsPaginated,
  putS3Object,
} from '@/server/infra/storage/s3-client'

async function hasTimescaleDbRestoreFunctions(db: NodePgDatabase): Promise<boolean> {
  try {
    const result = await db.execute(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'timescaledb_pre_restore'`,
    )
    return result.rows.length > 0
  } catch (err) {
    log.warn('TimescaleDB function probe failed; proceeding without hooks', {
      err: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

const execFileAsync = promisify(execFile)
const log = getLogger('backup.service')

let pgToolsAvailable: boolean | null = null

export async function checkPgToolsAvailable(): Promise<boolean> {
  if (pgToolsAvailable !== null) {
    return pgToolsAvailable
  }
  try {
    await execFileAsync('pg_dump', ['--version'])
    await execFileAsync('psql', ['--version'])
    pgToolsAvailable = true
    log.info('PostgreSQL client tools detected')
  } catch {
    pgToolsAvailable = false
    log.warn('PostgreSQL client tools (pg_dump, psql) not found; backup functionality disabled')
  }
  return pgToolsAvailable
}

export function getPgToolsAvailableSync(): boolean {
  return pgToolsAvailable ?? false
}

async function ensurePgTools(): Promise<void> {
  const available = await checkPgToolsAvailable()
  if (!available) {
    throw new ActionFailure(503, '当前运行环境缺少 postgresql-client，备份与还原功能不可用')
  }
}

function getPgConnectionOptions(): { args: string[]; env: Record<string, string> } {
  const url = DATABASE_URL
  if (!url) {
    throw new DomainError('INTERNAL', 'DATABASE_URL 未配置')
  }
  const parsed = new URL(url)
  const env: Record<string, string> = { ...processEnv }
  if (parsed.password) {
    env.PGPASSWORD = parsed.password
  }
  const args = [
    `--host=${parsed.hostname}`,
    `--port=${parsed.port || '5432'}`,
    `--dbname=${parsed.pathname.slice(1)}`,
    `--username=${parsed.username}`,
  ]
  return { args, env }
}

import type { BackupFileDto } from '@/shared/types/backup'
export type { BackupFileDto }

export async function createBackup(): Promise<{ fileName: string; size: number }> {
  await ensurePgTools()
  const { args: connArgs, env } = getPgConnectionOptions()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const key = `backup/backup-${timestamp}.sql.gz`

  log.info('Starting backup', { key })

  const pgDump = spawn(
    'pg_dump',
    ['--no-owner', '--no-acl', '--clean', '--if-exists', '--exclude-table-data=audit_log', ...connArgs],
    { env },
  )

  const gzip = createGzip()
  pgDump.stdout.pipe(gzip)

  const chunks: Buffer[] = []
  gzip.on('data', (chunk: Buffer) => chunks.push(chunk))

  await new Promise<void>((resolve, reject) => {
    pgDump.on('error', reject)
    pgDump.on('close', (code) => {
      if (code !== 0) {
        reject(new DomainError('INTERNAL', `pg_dump 退出码 ${code}`))
      } else {
        gzip.end()
      }
    })
    gzip.on('end', () => resolve())
    gzip.on('error', reject)
  })

  const buffer = Buffer.concat(chunks)
  await putS3Object(key, buffer, 'application/gzip')

  log.info('Backup completed', { key, size: buffer.length })
  return { fileName: key.split('/').pop()!, size: buffer.length }
}

export async function listBackups(
  limit?: number,
  continuationToken?: string,
): Promise<{ files: BackupFileDto[]; nextContinuationToken?: string }> {
  try {
    const { objects, nextContinuationToken } = await listS3ObjectsPaginated('backup/', limit, continuationToken)
    const files = objects
      .filter((o) => o.key.endsWith('.sql.gz'))
      .map((o) => ({
        key: o.key,
        fileName: o.key.split('/').pop()!,
        size: o.size,
        lastModified: o.lastModified.toISOString(),
      }))
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
    return { files, nextContinuationToken }
  } catch (error) {
    if (error instanceof ActionFailure) {
      return { files: [] }
    }
    log.error('listBackups failed', { error: error instanceof Error ? error.message : String(error) })
    return { files: [] }
  }
}

export async function getBackupBuffer(key: string): Promise<Buffer> {
  return getS3ObjectBuffer(key)
}

export async function cleanupOldBackups(days: number): Promise<void> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const objects = await listS3Objects('backup/')
  const toDelete = objects.filter((o) => o.lastModified < cutoff).map((o) => o.key)

  if (toDelete.length === 0) {
    return
  }

  log.info('Cleaning up old backups', { count: toDelete.length, cutoff: cutoff.toISOString() })
  await deleteS3Objects(toDelete)
}

export async function deleteBackup(key: string): Promise<void> {
  await deleteS3Object(key)
  log.info('Backup deleted', { key })
}

export async function extractBackupSql(buffer: Buffer, fileName: string): Promise<string> {
  if (fileName.endsWith('.sql')) {
    if (buffer.length > MAX_SQL_SIZE) {
      throw new ActionFailure(400, '备份文件过大，请确认文件未损坏。')
    }
    return buffer.toString('utf-8')
  }

  if (fileName.endsWith('.gz')) {
    if (buffer.length < 2 || !buffer.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))) {
      throw new ActionFailure(400, '备份文件格式不正确，请上传有效的 gzip 文件')
    }

    const gunzip = createGunzip()
    const inputStream = Readable.from([buffer])
    inputStream.pipe(gunzip)

    const chunks: Buffer[] = []
    let totalSize = 0
    gunzip.on('data', (chunk: Buffer) => {
      totalSize += chunk.length
      if (totalSize > MAX_SQL_SIZE) {
        gunzip.destroy(new Error('exceeded max decompressed size'))
        return
      }
      chunks.push(chunk)
    })

    await new Promise<void>((resolve, reject) => {
      gunzip.on('end', () => resolve())
      gunzip.on('error', reject)
      inputStream.on('error', reject)
    })

    return Buffer.concat(chunks).toString('utf-8')
  }

  throw new ActionFailure(400, '不支持的备份文件格式，仅支持 .sql 或 .gz')
}

// Dangerous SQL patterns that must never be allowed in a restore file.
// These are evaluated case-insensitively against the decompressed dump.
// SQL comments (/* … */) can break naive word-boundary regexes, so we
// use patterns that tolerate whitespace/comments between tokens.
const BLOCKED_PATTERNS = [
  /\bDROP\s+(?:\/\*[^]*?\*\/\s*)*DATABASE\b/i,
  /\bALTER\s+(?:\/\*[^]*?\*\/\s*)*ROLE\b/i,
  /\bDROP\s+(?:\/\*[^]*?\*\/\s*)*ROLE\b/i,
  /\bALTER\s+(?:\/\*[^]*?\*\/\s*)*SYSTEM\b/i,
  /\bCOPY\b[^\n;]*?\bTO\b[^\n;]*?\bPROGRAM\b/i,
  /\\!/i, // psql shell escape (e.g. \! rm -rf /)
  /\\i\b/i, // psql \include — can pull arbitrary files
  /\\include\b/i,
  /\\copy\b/i,
  /\\lo_import\b/i,
  /\\lo_export\b/i,
  /\\c\b/i, // \c connect to different database
  /\\o\b/i, // \o redirect output to arbitrary file
]

// Decompressed SQL size cap: 500 MB. Anything larger is suspicious
// and would likely OOM the Node process before reaching psql.
const MAX_SQL_SIZE = 500 * 1024 * 1024

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

// Pull the `timescaledb_version` value out of the dump's
// `_timescaledb_catalog.metadata` COPY block. The block is a
// tab-separated list with three columns (key, value,
// include_in_telemetry) terminated by a `\.` line; we look for the
// row whose first column is `timescaledb_version` and return its
// second column. Returns `null` when the dump doesn't carry
// TimescaleDB metadata (e.g. a plain-Postgres backup) — the caller
// is expected to treat that as "no version pin, proceed".
function readTimescaleVersionFromDump(sql: string): string | null {
  const block = /COPY _timescaledb_catalog\.metadata[^\n]*\n([\s\S]*?)^\\\.$/m.exec(sql)
  if (!block) {
    return null
  }
  const match = /^timescaledb_version\t([^\t\n]+)/m.exec(block[1])
  return match ? match[1] : null
}

export async function restoreFromSql(db: NodePgDatabase, sql: string): Promise<void> {
  await ensurePgTools()
  const { args: connArgs, env } = getPgConnectionOptions()

  log.info('Starting restore')

  const dumpedVersion = readTimescaleVersionFromDump(sql)
  const timescaleEnabled = await hasTimescaleDbRestoreFunctions(db)

  // TimescaleDB pre/post restore hooks must run OUTSIDE the psql
  // invocation that feeds the dump.  psql switches to COPY mode when
  // it encounters a "COPY … FROM stdin;" block and consumes stdin
  // line-by-line until a "\." terminator.  If the dump's last COPY
  // block has any termination issue (encoding glitch, Windows CRLF,
  // etc.), psql stays in COPY mode and swallows the COMMIT /
  // post_restore SQL as data — then tries to execute the leftover
  // COPY rows as standalone SQL, producing exactly the "syntax error
  // at or near …" seen in production.  Calling the hooks through the
  // Drizzle connection (a separate TCP socket) sidesteps the problem
  // entirely.
  if (timescaleEnabled) {
    await db.execute(drizzleSql`SELECT public.timescaledb_pre_restore()`)
  }

  // ON_ERROR_STOP=1 causes psql to abort on the first SQL error
  // instead of continuing silently.  Without it, a broken restore
  // could exit with code 0 and log "completed successfully" while
  // the data is only partially loaded and the TimescaleDB
  // post_restore hook was never called.
  const psql = spawn('psql', ['--single-transaction', '-v', 'ON_ERROR_STOP=1', ...connArgs], {
    env,
    stdio: ['pipe', 'inherit', 'inherit'],
  })

  // Stream the SQL to psql stdin instead of buffering the entire dump
  // in memory.  This also prevents --echo-all from leaking the dump
  // (which may contain secrets) to stdout/stderr logs.
  Readable.from([`SET CONSTRAINTS ALL DEFERRED;\n`, sql, '\n']).pipe(psql.stdin)

  // When ON_ERROR_STOP aborts psql early, the stdin pipe is closed
  // before all data has been flushed.  Without a listener the
  // resulting EPIPE would crash the process as an unhandled error.
  psql.stdin.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
      log.warn('psql stdin error', { err: err.message })
    }
  })

  await new Promise<void>((resolve, reject) => {
    psql.on('error', reject)
    psql.on('close', (code) => {
      if (code !== 0) {
        reject(new DomainError('INTERNAL', `数据库还原失败，psql 退出码 ${code}`))
      } else {
        resolve()
      }
    })
  })

  if (timescaleEnabled) {
    // Align the extension version to what the dump expects before
    // calling post_restore().  Upgrades are applied automatically;
    // downgrades are skipped (unsafe during restore — would require
    // DROP + CREATE which destroys hypertables).
    if (dumpedVersion !== null) {
      const extResult = await db.execute<{ extversion: string }>(
        `SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`,
      )
      const installedVersion = extResult.rows[0]?.extversion ?? null
      if (installedVersion !== null && installedVersion !== dumpedVersion) {
        const currentParts = installedVersion.split('.').map((p) => parseInt(p, 10))
        const targetParts = dumpedVersion.split('.').map((p) => parseInt(p, 10))
        const isUpgrade =
          currentParts[0] < targetParts[0] ||
          (currentParts[0] === targetParts[0] && currentParts[1] < targetParts[1]) ||
          (currentParts[0] === targetParts[0] &&
            currentParts[1] === targetParts[1] &&
            (currentParts[2] ?? 0) < (targetParts[2] ?? 0))
        if (isUpgrade) {
          log.info('Upgrading timescaledb extension before post_restore', {
            from: installedVersion,
            to: dumpedVersion,
          })
          try {
            await db.execute(`ALTER EXTENSION timescaledb UPDATE TO '${dumpedVersion}'`)
          } catch (err) {
            log.warn('Failed to upgrade timescaledb extension before post_restore', {
              err: err instanceof Error ? err.message : String(err),
            })
          }
        } else {
          log.warn('TimescaleDB downgrade skipped during restore', {
            from: installedVersion,
            to: dumpedVersion,
          })
        }
      }
    }

    try {
      await db.execute(drizzleSql`SELECT public.timescaledb_post_restore()`)
    } catch (err) {
      log.warn(
        'timescaledb_post_restore() failed; the SQL dump was already applied successfully, but TimescaleDB metadata may be inconsistent. If this is a non-TimescaleDB backup restored to TimescaleDB, you can usually ignore this.',
        {
          err: err instanceof Error ? err.message : String(err),
        },
      )
    }
  }

  log.info('Restore completed successfully')
}

export async function restoreFromBackup(db: NodePgDatabase, buffer: Buffer, fileName: string): Promise<void> {
  const sql = await extractBackupSql(buffer, fileName)
  validateBackupSql(sql)
  await restoreFromSql(db, sql)
}
