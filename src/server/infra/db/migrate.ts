import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

import { DATABASE_URL } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_SCHEMA = 'drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

// Advisory-lock IDs for Kobato migrations.
// Any two distinct integers work; these are arbitrary constants chosen
// to avoid collision with other applications using the same Postgres.
const KOBATO_LOCK_ID = 1_743_298_651
const DRIZZLE_LOCK_ID = 982_347_561

const log = getLogger('db:migrations')

export async function migrateDatabase(): Promise<void> {
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
    await migrationDb.execute(sql`SELECT pg_advisory_lock(${KOBATO_LOCK_ID}, ${DRIZZLE_LOCK_ID})`)
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
        await migrationDb.execute(sql`SELECT pg_advisory_unlock(${KOBATO_LOCK_ID}, ${DRIZZLE_LOCK_ID})`)
      } catch (error) {
        log.warn('Failed to release database migration advisory lock', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    await client.end()
  }
}
