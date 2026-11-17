import type { Database } from '@kobato/db/database.ts'

import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export const MIGRATIONS_TABLE = '__drizzle_migrations'

/** Resolve from the installed package, not a bundled chunk's URL or the process cwd. */
export function defaultMigrationsFolder(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@kobato/db/package.json')), 'drizzle')
}

/** Apply the package-owned migrations, or a caller-selected folder such as the SEA VFS mount. */
export function migrateDatabase(db: Database, migrationsFolder = defaultMigrationsFolder()): void {
  migrate(db, { migrationsFolder, migrationsTable: MIGRATIONS_TABLE })
}
