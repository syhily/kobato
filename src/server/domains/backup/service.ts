import { execFile, spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { createGunzip, createGzip } from 'node:zlib'

import { DATABASE_URL } from '@/server/infra/env'
import { ActionFailure, DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import {
  deleteS3Objects,
  getS3ObjectBuffer,
  listS3Objects,
  listS3ObjectsPaginated,
  putS3Object,
} from '@/server/infra/storage/s3-client'

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

function ensurePgTools(): void {
  if (!pgToolsAvailable) {
    throw new ActionFailure(503, '当前运行环境缺少 postgresql-client，备份与还原功能不可用')
  }
}

function getPgConnectionOptions(): { args: string[]; env: Record<string, string> } {
  const url = DATABASE_URL
  if (!url) {
    throw new DomainError('INTERNAL', 'DATABASE_URL 未配置')
  }
  const parsed = new URL(url)
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
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
  ensurePgTools()
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
  const { objects, nextContinuationToken } = await listS3ObjectsPaginated('backup/', limit, continuationToken)
  const files = objects
    .filter((o) => o.key.endsWith('.sql.gz'))
    .map((o) => ({
      key: o.key,
      fileName: o.key.split('/').pop()!,
      size: o.size,
      lastModified: o.lastModified.toISOString(),
    }))
  return { files, nextContinuationToken }
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
  await deleteS3Objects([key])
  log.info('Backup deleted', { key })
}

export async function restoreFromBackup(buffer: Buffer): Promise<void> {
  ensurePgTools()
  const { args: connArgs, env } = getPgConnectionOptions()

  log.info('Starting restore')

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

  const sql = Buffer.concat(chunks).toString('utf-8')

  // TimescaleDB requires pre/post restore hooks so that hypertable
  // catalog metadata is recreated correctly. See:
  // https://docs.timescale.com/use-timescale/latest/backup-restore/pg-dump-and-restore/
  const preSql = 'SELECT timescaledb_pre_restore();\n'
  const postSql = 'SELECT timescaledb_post_restore();\n'
  const wrappedSql = `${preSql}BEGIN;\nSET CONSTRAINTS ALL DEFERRED;\n${sql}\nCOMMIT;\n${postSql}`

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
