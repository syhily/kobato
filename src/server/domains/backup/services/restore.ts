import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql as drizzleSql } from 'drizzle-orm'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'

import {
  ensurePgTools,
  getPgConnectionOptions,
  hasTimescaleDbRestoreFunctions,
  MAX_SQL_SIZE,
} from '@/server/domains/backup/services/shared'
import { validateBackupHeader, validateBackupSql } from '@/server/domains/backup/services/validate'
import { ActionFailure, DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('backup.service')

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

// Single semver gate for the dumped TimescaleDB version: the parse site is
// the only place the value enters the process, and it throws on anything
// that is not `x.y.z`, so downstream consumers (e.g. the ALTER EXTENSION
// literal below) can trust the shape without re-validating.
const TIMESCALEDB_VERSION_RE = /^\d+\.\d+\.\d+$/

export function readTimescaleVersionFromDump(sql: string): string | null {
  const block = /COPY _timescaledb_catalog\.metadata[^\n]*\n([\s\S]*?)^\\\.$/m.exec(sql)
  if (!block) {
    return null
  }
  const match = /^timescaledb_version\t([^\t\n]+)/m.exec(block[1])
  const version = match ? match[1] : null
  if (version !== null && !TIMESCALEDB_VERSION_RE.test(version)) {
    throw new ActionFailure(400, '备份文件中的 TimescaleDB 版本号格式异常，还原已中止。')
  }
  return version
}

export async function restoreFromSql(db: NodePgDatabase, sql: string): Promise<void> {
  await ensurePgTools()
  const { args: connArgs, env } = getPgConnectionOptions()

  log.info('Starting restore')

  const dumpedVersion = readTimescaleVersionFromDump(sql)
  const timescaleEnabled = await hasTimescaleDbRestoreFunctions(db)

  if (timescaleEnabled) {
    await db.execute(drizzleSql`SELECT public.timescaledb_pre_restore()`)
  }

  try {
    const restoreRole = env.RESTORE_ROLE
    const roleArgs = restoreRole ? ['--role=' + restoreRole, '--no-owner'] : []
    const psql = spawn(
      'psql',
      ['--no-psqlrc', '--single-transaction', '-v', 'ON_ERROR_STOP=1', ...roleArgs, ...connArgs],
      {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    // Capture psql output instead of inheriting stdout/stderr.  In production
    // this keeps restore noise out of the service logs; in tests it prevents
    // `setval`/`ALTER TABLE`/`CREATE INDEX` output from polluting the runner.
    const MAX_OUTPUT = 1024 * 1024
    let stdoutBuf = ''
    let stderrBuf = ''

    psql.stdout.on('data', (chunk: Buffer) => {
      if (stdoutBuf.length < MAX_OUTPUT) {
        stdoutBuf += chunk.toString('utf-8')
      }
    })

    psql.stderr.on('data', (chunk: Buffer) => {
      if (stderrBuf.length < MAX_OUTPUT) {
        stderrBuf += chunk.toString('utf-8')
      }
    })

    // Clear the public schema before applying the dump so that tables added
    // after the backup was taken (e.g. by later migrations) do not block
    // drops of older objects via foreign-key dependencies.  Because psql is
    // run with --single-transaction this cleanup is atomic: if the restore
    // fails the transaction rolls back and the pre-existing tables remain.
    const preRestoreCleanup = `DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;`

    const streamPrefix = restoreRole ? [`SET ROLE "${restoreRole}";\n`] : []
    Readable.from([...streamPrefix, `SET CONSTRAINTS ALL DEFERRED;\n`, preRestoreCleanup, '\n', sql, '\n']).pipe(
      psql.stdin,
    )

    psql.stdin.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
        log.warn('psql stdin error', { err: err.message })
      }
    })

    await new Promise<void>((resolve, reject) => {
      psql.on('error', reject)
      psql.on('close', (code) => {
        if (code !== 0) {
          const detail = stderrBuf.trim() || stdoutBuf.trim() || undefined
          reject(new DomainError('INTERNAL', `数据库还原失败，psql 退出码 ${code}${detail ? `: ${detail}` : ''}`))
        } else {
          if (stdoutBuf || stderrBuf) {
            log.debug('psql restore output', { stdout: stdoutBuf, stderr: stderrBuf })
          }
          resolve()
        }
      })
    })

    if (timescaleEnabled) {
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
              // dumpedVersion is validated to /^\d+\.\d+\.\d+$/ by
              // readTimescaleVersionFromDump, so it is safe to inline as a
              // literal. ALTER EXTENSION ... UPDATE TO does NOT accept a
              // bind parameter, so drizzleSql`... ${v}` (which emits `$1`)
              // fails at runtime — use sql.raw with the validated literal.
              await db.execute(drizzleSql.raw(`ALTER EXTENSION timescaledb UPDATE TO '${dumpedVersion}'`))
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
    }

    log.info('Restore completed successfully')
  } finally {
    if (timescaleEnabled) {
      try {
        await db.execute(drizzleSql`SELECT public.timescaledb_post_restore()`)
      } catch (err) {
        log.warn('timescaledb_post_restore() failed during restore cleanup', {
          err: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
}

export async function restoreFromBackup(db: NodePgDatabase, buffer: Buffer, fileName: string): Promise<void> {
  const sql = await extractBackupSql(buffer, fileName)
  validateBackupHeader(sql)
  validateBackupSql(sql)
  await restoreFromSql(db, sql)
}
