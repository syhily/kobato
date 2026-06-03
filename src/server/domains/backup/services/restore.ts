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
import { validateBackupSql } from '@/server/domains/backup/services/validate'
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

  if (timescaleEnabled) {
    await db.execute(drizzleSql`SELECT public.timescaledb_pre_restore()`)
  }

  const psql = spawn('psql', ['--single-transaction', '-v', 'ON_ERROR_STOP=1', ...connArgs], {
    env,
    stdio: ['pipe', 'inherit', 'inherit'],
  })

  Readable.from([`SET CONSTRAINTS ALL DEFERRED;\n`, sql, '\n']).pipe(psql.stdin)

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
        'timescaledb_post_restore() failed; the SQL dump was already applied successfully, but TimescaleDB metadata may be inconsistent.',
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
