import type { Database } from '@kobato/db/database.ts'

import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export const MIGRATIONS_TABLE = '__drizzle_migrations'

export interface MigrationLogger {
  info(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

export interface MigrateDatabaseOptions {
  migrationsFolder?: string
  embedded?: boolean
  logger?: MigrationLogger
}

/** Resolve from the installed package, not a bundled chunk's URL or the process cwd. */
export function defaultMigrationsFolder(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@kobato/db/package.json')), 'drizzle')
}

/** Migrate on the caller's connection, including its observability lifecycle. */
export function migrateDatabase(db: Database, options: MigrateDatabaseOptions = {}): void {
  const folder = options.migrationsFolder ?? defaultMigrationsFolder()
  const logger = options.logger
  logger?.info('Running database migrations', { migrationsFolder: folder, embedded: options.embedded === true })

  try {
    migrate(db, { migrationsFolder: folder, migrationsTable: MIGRATIONS_TABLE })
    logger?.info('Database migrations completed')
  } catch (error) {
    logger?.error('Database migrations failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
