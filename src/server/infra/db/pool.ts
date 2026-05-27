import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { DATABASE_URL, DB_POOL_MAX, DB_STATEMENT_TIMEOUT_MS } from '@/server/infra/env'

export function createDbPool(): { db: NodePgDatabase; pool: Pool } {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: DB_POOL_MAX,
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
  })
  const db = drizzle({ client: pool })
  return { db, pool }
}

// Singleton for server bootstrap and test compatibility.
const _poolInstance = createDbPool()
export const db = _poolInstance.db
export const pool = _poolInstance.pool

export async function closePool(pool: Pool): Promise<void> {
  if (!pool.ended && !pool.ending) {
    await pool.end()
  }
}
