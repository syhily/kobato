import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { runDatabaseMigrations } from '@/server/infra/db/migrate'
import { DATABASE_URL } from '@/server/infra/env'
import { registerShutdownHook } from '@/server/infra/shutdown'

// Drizzle 1.0.0-rc.1 narrowed `NodePgDatabase`'s sole generic from a raw
// `{ tableName: PgTable }` map to `AnyRelations` (= `TablesRelationalConfig`),
// and `DrizzlePgConfig` no longer accepts a `schema` field at all — schema-
// bound query helpers now live behind the new `defineRelations()` Relations
// API. Every call site in this codebase uses the core query builder
// (`db.select().from(...)`, `db.insert().values()`, …), which doesn't need
// either, so we drop the schema argument and let the generic default to
// `EmptyRelations`. If a future caller wants `db.query.<table>` style access,
// switch this to `drizzle({ connection, relations })` with a relations module
// and re-introduce the matching generic.
const globalForDb = globalThis as unknown as {
  db: NodePgDatabase | undefined
  pool: Pool | undefined
}

await runDatabaseMigrations()

// Own the Pool lifecycle explicitly so downstream code can reach the raw
// `pg.Pool` without spelunking into Drizzle internals. The Pool is stored
// on globalThis for HMR safety (same pattern as before) and passed to
// Drizzle via `{ client }`.
const pool: Pool = globalForDb.pool ?? new Pool({ connectionString: DATABASE_URL })

if (!globalForDb.pool) {
  globalForDb.pool = pool
}

export const db: NodePgDatabase = globalForDb.db ?? drizzle({ client: pool })

if (!globalForDb.db) {
  globalForDb.db = db
}

/** Direct access to the underlying `node-postgres` Pool. Needed by the
 *  analytics / audit batchers to acquire a `PoolClient` for `pg-copy-streams`.
 *  Every other call site should keep using `db`. */
export { pool }

export async function closePool(): Promise<void> {
  await pool.end()
}

registerShutdownHook(closePool)
