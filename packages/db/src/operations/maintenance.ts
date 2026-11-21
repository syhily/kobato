import type { Database } from '@kobato/db/database'

import { sql } from 'drizzle-orm'

export function vacuumDatabaseInto(db: Database, targetPath: string): void {
  db.run(sql.raw(`VACUUM INTO '${targetPath.replaceAll("'", "''")}'`))
}

export function analyzeDatabase(db: Database): void {
  db.run(sql`ANALYZE`)
}
