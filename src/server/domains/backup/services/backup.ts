import { spawn } from 'node:child_process'
import { createGzip } from 'node:zlib'

import type { BackupFileDto } from '@/shared/types/backup'

import { ensurePgTools, getPgConnectionOptions } from '@/server/domains/backup/services/shared'
import { getLogger } from '@/server/infra/logger'
import {
  deleteS3Object,
  deleteS3Objects,
  getS3ObjectBuffer,
  listS3Objects,
  listS3ObjectsPaginated,
  putS3Object,
} from '@/server/infra/storage/s3-client'

const log = getLogger('backup.service')

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
        reject(new Error(`pg_dump 退出码 ${code}`))
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
    if (error instanceof Error && 'status' in error && error.status === 503) {
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
