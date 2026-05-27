import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

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
    ['--no-owner', '--no-acl', '--clean', '--if-exists', '--exclude-table=audit_log', ...connArgs],
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
    throw error
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
    gunzip.on('data', (chunk: Buffer) => chunks.push(chunk))

    await new Promise<void>((resolve, reject) => {
      gunzip.on('end', () => resolve())
      gunzip.on('error', reject)
      inputStream.on('error', reject)
    })

    return Buffer.concat(chunks).toString('utf-8')
  }

  throw new ActionFailure(400, '不支持的备份文件格式，仅支持 .sql 或 .gz')
}

export function validateBackupSql(sql: string): void {
  const hasPgDumpHeader = /PostgreSQL database dump/i.test(sql)
  const hasCreateTable = /CREATE\s+TABLE/i.test(sql)
  const hasInsert = /INSERT\s+INTO/i.test(sql)
  if (!hasPgDumpHeader && !hasCreateTable && !hasInsert) {
    throw new ActionFailure(400, '备份文件内容不符合数据库备份格式')
  }
}

export async function restoreFromSql(db: NodePgDatabase, sql: string): Promise<void> {
  await ensurePgTools()
  const { args: connArgs, env } = getPgConnectionOptions()

  log.info('Starting restore')

  const timescaleEnabled = await hasTimescaleDbRestoreFunctions(db)
  let wrappedSql: string

  if (timescaleEnabled) {
    // TimescaleDB requires pre/post restore hooks so that hypertable
    // catalog metadata is recreated correctly. See:
    // https://docs.timescale.com/use-timescale/latest/backup-restore/pg-dump-and-restore/
    const preSql = 'SELECT public.timescaledb_pre_restore();\n'
    const postSql = 'SELECT public.timescaledb_post_restore();\n'
    wrappedSql = `${preSql}BEGIN;\nSET CONSTRAINTS ALL DEFERRED;\n${sql}\nCOMMIT;\n${postSql}`
  } else {
    wrappedSql = `BEGIN;\nSET CONSTRAINTS ALL DEFERRED;\n${sql}\nCOMMIT;\n`
  }

  const psql = spawn('psql', [...connArgs, '--echo-all'], {
    env,
    stdio: ['pipe', 'inherit', 'inherit'],
  })

  psql.stdin.write(wrappedSql)
  psql.stdin.end()

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

  log.info('Restore completed successfully')
}

export async function restoreFromBackup(db: NodePgDatabase, buffer: Buffer, fileName: string): Promise<void> {
  const sql = await extractBackupSql(buffer, fileName)
  validateBackupSql(sql)
  await restoreFromSql(db, sql)
}
