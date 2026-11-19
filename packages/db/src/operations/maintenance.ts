import type { Database } from '@kobato/db/database.ts'

import { sql } from 'drizzle-orm'

/**
 * The raw SQLite maintenance statements, owned here so no caller composes
 * `VACUUM`/`ANALYZE` SQL by hand: `VACUUM INTO` writes a consistent,
 * fully-checkpointed copy of the database to a host path (the only string
 * interpolation is the doubled-quote path escape), and `ANALYZE` refreshes
 * the query planner's statistics after a bulk load.
 */

export function vacuumDatabaseInto(db: Database, targetPath: string): void {
  db.run(sql.raw(`VACUUM INTO '${targetPath.replaceAll("'", "''")}'`))
}

export function analyzeDatabase(db: Database): void {
  db.run(sql`ANALYZE`)
}
