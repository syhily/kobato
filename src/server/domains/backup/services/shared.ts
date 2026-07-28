import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { processEnv, serverConfig } from '@/server/infra/config'
import { ActionFailure, DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

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

export async function ensurePgTools(): Promise<void> {
  const available = await checkPgToolsAvailable()
  if (!available) {
    throw new ActionFailure(503, '当前运行环境缺少 postgresql-client，备份与还原功能不可用')
  }
}

export function getPgConnectionOptions(): { args: string[]; env: Record<string, string> } {
  const url = serverConfig.database.url
  if (!url) {
    throw new DomainError('INTERNAL', '数据库连接（database.url）未配置')
  }
  const parsed = new URL(url)
  const env: Record<string, string> = {
    PATH: processEnv.PATH ?? '',
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGDATABASE: parsed.pathname.slice(1),
    PGUSER: parsed.username,
  }
  if (parsed.password) {
    env.PGPASSWORD = parsed.password
  }
  if (serverConfig.database.restoreRole) {
    env.RESTORE_ROLE = serverConfig.database.restoreRole
  }
  const args = [
    `--host=${parsed.hostname}`,
    `--port=${parsed.port || '5432'}`,
    `--dbname=${parsed.pathname.slice(1)}`,
    `--username=${parsed.username}`,
  ]
  return { args, env }
}

// Decompressed SQL size cap: 500 MB.
export const MAX_SQL_SIZE = 500 * 1024 * 1024

export async function hasTimescaleDbRestoreFunctions(db: NodePgDatabase): Promise<boolean> {
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
