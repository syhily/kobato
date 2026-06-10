import { spawn } from 'node:child_process'
import { Transform } from 'node:stream'
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

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/

export function isValidBackupKey(key: string): boolean {
  return TIMESTAMP_RE.test(key)
}

export function buildBackupS3Key(timestamp: string): string {
  return `backup/backup-${timestamp}.sql.gz`
}

export async function createBackup(): Promise<{ fileName: string; size: number }> {
  await ensurePgTools()
  const { args: connArgs, env } = getPgConnectionOptions()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const key = buildBackupS3Key(timestamp)

  log.info('Starting backup', { key })

  const pgDump = spawn(
    'pg_dump',
    ['--no-owner', '--no-acl', '--clean', '--if-exists', '--exclude-table-data=audit_log', ...connArgs],
    { env },
  )

  const gzip = createGzip()
  pgDump.stdout.pipe(gzip)

  let uploadedBytes = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      uploadedBytes += chunk.length
      callback(null, chunk)
    },
  })
  gzip.pipe(counter)

  const pgDumpDone = new Promise<void>((resolve, reject) => {
    pgDump.on('error', reject)
    pgDump.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump 退出码 ${code}`))
      } else {
        gzip.end()
        resolve()
      }
    })
  })

  const uploadDone = putS3Object(key, counter, 'application/gzip')

  await Promise.all([pgDumpDone, uploadDone])

  log.info('Backup completed', { key, size: uploadedBytes })
  return { fileName: key.split('/').pop()!, size: uploadedBytes }
}

export async function listBackups(
  limit?: number,
  continuationToken?: string,
): Promise<{ files: BackupFileDto[]; nextContinuationToken?: string }> {
  try {
    const { objects, nextContinuationToken } = await listS3ObjectsPaginated('backup/', limit, continuationToken)
    const files = objects
      .filter((o) => o.key.endsWith('.sql.gz'))
      .map((o) => {
        const timestamp = o.key.replace(/^backup\/backup-/, '').replace(/\.sql\.gz$/, '')
        return { timestamp, fileName: o.key.split('/').pop()!, size: o.size, lastModified: o.lastModified }
      })
      .filter((o) => isValidBackupKey(o.timestamp))
      .map((o) => ({
        key: o.timestamp,
        fileName: o.fileName,
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
