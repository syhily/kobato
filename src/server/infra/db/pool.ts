import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { DATABASE_URL, DB_POOL_MAX, DB_STATEMENT_TIMEOUT_MS } from '@/server/infra/env'
import { setServerPhase } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('db.pool')

export function createDbPool(): { db: NodePgDatabase; pool: Pool } {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: DB_POOL_MAX,
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
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
