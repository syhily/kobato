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
}

await runDatabaseMigrations()

// Using globalThis to store the database connection so the Vite dev server's
// HMR-driven module reloads don't open a new pool on every edit.
export const db: NodePgDatabase = globalForDb.db ?? drizzle({ connection: DATABASE_URL })

if (!globalForDb.db) {
  globalForDb.db = db
}

// Direct access to the underlying `node-postgres` Pool. Drizzle's typed
// `db` surface doesn't include `$client` (we drop the extra generic on
// purpose, see the comment above), so the analytics batcher needs to
// reach the raw pool through this helper to acquire a `PoolClient` for
// `pg-copy-streams`. Every other call site should keep using `db`.
export function getRawPool(): Pool {
  const client = (db as unknown as Record<string, unknown>).$client
  if (!(client instanceof Pool)) {
    throw new Error('Expected db.$client to be a pg Pool')
  }
  return client
}

export async function closePool(): Promise<void> {
  await getRawPool().end()
}

registerShutdownHook(closePool)
