import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { serverConfig } from '@/server/infra/config'
import { setServerPhase } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('db.pool')

export function createDbPool(): { db: NodePgDatabase; pool: Pool } {
  const pool = new Pool({
    connectionString: serverConfig.database.url,
    max: serverConfig.database.poolMax,
    statement_timeout: serverConfig.database.statementTimeoutMs,
    connectionTimeoutMillis: 5000,
  })

  pool.on('error', (err) => {
    log.error('Unexpected pool error; marking server as failed', { err: err.message })
    setServerPhase('failed')
  })

  const db = drizzle({ client: pool })
  return { db, pool }
}

export async function closePool(pool: Pool): Promise<void> {
  if (!pool.ended && !pool.ending) {
    await pool.end()
  }
}
