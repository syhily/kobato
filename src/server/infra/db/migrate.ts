import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

import { DATABASE_URL, TIMESCALEDB_VERSION } from '@/server/infra/env'
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

// Idempotently reconcile the TimescaleDB extension against the version
// pinned via the `TIMESCALEDB_VERSION` env var. Runs after the Drizzle
// migrations so that whatever version the Postgres image initially
// installs (via the `*_access_log_timescale` migration's plain
// `CREATE EXTENSION IF NOT EXISTS timescaledb;`) is brought up or
// down to the pinned version before the process exits. Without this,
// a Postgres image shipping a different TimescaleDB than the pin would
// leave the extension at the wrong version, and the post_restore check
// added in `backup/service.ts` would later reject dumps stamped with
// the operator's intended version.
//
// We use `sql.raw` for the CREATE/ALTER statements because the version
// is a literal identifier, not a bind parameter — Postgres does not
// accept parameter binding for `VERSION '<x>'` clauses.
async function ensureTimescaleDbExtension(migrationDb: NodePgDatabase): Promise<void> {
  const result = await migrationDb.execute<{ extversion: string }>(
    sql`SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`,
  )
  const installedVersion = result.rows[0]?.extversion ?? null

  if (installedVersion === TIMESCALEDB_VERSION) {
    return
  }

  if (installedVersion === null) {
    log.info('Creating timescaledb extension at pinned version', { version: TIMESCALEDB_VERSION })
    await migrationDb.execute(sql.raw(`CREATE EXTENSION timescaledb VERSION '${TIMESCALEDB_VERSION}'`))
  } else {
    log.info('Upgrading timescaledb extension to pinned version', {
      from: installedVersion,
      to: TIMESCALEDB_VERSION,
    })
    await migrationDb.execute(sql.raw(`ALTER EXTENSION timescaledb UPDATE TO '${TIMESCALEDB_VERSION}'`))
  }
}

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
    await ensureTimescaleDbExtension(migrationDb)
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
