import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import process from 'node:process'

import { DATABASE_URL } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_SCHEMA = 'drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

const log = getLogger('db:migrations')

const globalForMigrations = globalThis as typeof globalThis & {
  databaseMigrationsPromise: Promise<void> | undefined
}

async function migrateDatabase(): Promise<void> {
  const migrationDb = drizzle({
    connection: {
      connectionString: DATABASE_URL,
      max: 1,
    },
  })
  const client = migrationDb.$client as { end: () => Promise<void> }
  let locked = false

  log.info('Running database migrations', { migrationsFolder: MIGRATIONS_FOLDER })

  try {
    await migrationDb.execute(sql`SELECT pg_advisory_lock(hashtext('yufan.me'), hashtext('drizzle'))`)
    locked = true
    await migrate(migrationDb, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    })
    log.info('Database migrations completed')
  } catch (error) {
    log.error('Database migrations failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    if (locked) {
      try {
        await migrationDb.execute(sql`SELECT pg_advisory_unlock(hashtext('yufan.me'), hashtext('drizzle'))`)
      } catch (error) {
        log.warn('Failed to release database migration advisory lock', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    await client.end()
  }
}

export function runDatabaseMigrations(): Promise<void> {
  if (process.env.VITEST === 'true') {
    log.debug('Skipping database migrations in Vitest')
    return Promise.resolve()
  }

  globalForMigrations.databaseMigrationsPromise ??= migrateDatabase()
  return globalForMigrations.databaseMigrationsPromise
}
