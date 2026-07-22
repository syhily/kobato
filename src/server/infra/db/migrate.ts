import type { MigrationMeta } from 'drizzle-orm/migrator'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'
import { formatToMillis } from 'drizzle-orm/migrator.utils'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePg } from 'drizzle-orm/pg-core/async/session'
import { createHash } from 'node:crypto'

import { DATABASE_URL } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'
import { getEmbeddedAsset, isSea, listEmbeddedAssetKeys } from '@/server/infra/sea'
import { requireEmbeddedAssetText } from '@/server/infra/sea-asset'
import { SEA_DRIZZLE_ASSET_PREFIX } from '@/shared/sea/assets'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_SCHEMA = 'drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

// Advisory-lock IDs for Kobato migrations.
// Any two distinct integers work; these are arbitrary constants chosen
// to avoid collision with other applications using the same Postgres.
const KOBATO_LOCK_ID = 1_743_298_651
const DRIZZLE_LOCK_ID = 982_347_561

const log = getLogger('db:migrations')

// Embedded asset keys look like `<SEA_DRIZZLE_ASSET_PREFIX><folder>/migration.sql`
// (the prefix is owned by `@/shared/sea/assets`).
const MIGRATION_SQL_SUFFIX = '/migration.sql'

/**
 * Source the embedded migration reader pulls SQL bytes from: SEA blob
 * assets in production, the real `drizzle/` tree in tests.
 */
export interface EmbeddedMigrationAssets {
  listKeys(prefix: string): string[]
  getAsset(key: string): Buffer | null
}

const SEA_MIGRATION_ASSETS: EmbeddedMigrationAssets = {
  listKeys: listEmbeddedAssetKeys,
  getAsset: getEmbeddedAsset,
}

/**
 * SEA-mode counterpart of drizzle-orm's `readMigrationFiles`
 * (node_modules/drizzle-orm/migrator.js), reading from embedded assets
 * instead of `./drizzle` on disk. The replication is exact: folders are
 * discovered by their `migration.sql` key, sorted with `localeCompare`,
 * the SQL is split on `--> statement-breakpoint`, the hash is the sha256
 * of the full file text, and `folderMillis` comes from the folder's
 * 14-digit timestamp prefix. The returned list is executed by drizzle's
 * own `migrate` (`pg-core/async/session`) — the very function the
 * node-postgres migrator delegates to — so table creation, schema
 * upgrades, statement splitting, transaction behavior, and
 * `__drizzle_migrations` inserts are identical to the fs path.
 */
function readEmbeddedMigrationFiles(assets: EmbeddedMigrationAssets): MigrationMeta[] {
  const migrations = assets
    .listKeys(SEA_DRIZZLE_ASSET_PREFIX)
    .filter((key) => key.endsWith(MIGRATION_SQL_SUFFIX))
    .map((key) => ({ key, name: key.slice(SEA_DRIZZLE_ASSET_PREFIX.length, -MIGRATION_SQL_SUFFIX.length) }))
  migrations.sort((a, b) => a.name.localeCompare(b.name))

  return migrations.map(({ key, name }) => {
    const query = requireEmbeddedAssetText(assets.getAsset(key), `Embedded migration asset missing: ${key}`)
    return {
      sql: query.split('--> statement-breakpoint'),
      bps: true,
      folderMillis: formatToMillis(name.slice(0, 14)),
      hash: createHash('sha256').update(query).digest('hex'),
      name,
    }
  })
}

/**
 * Run the embedded-asset migration path on an open connection. Exported
 * for tests (folder/embedded equivalence); production code enters
 * through `migrateDatabase`.
 */
export async function runEmbeddedMigrations(
  db: NodePgDatabase,
  assets: EmbeddedMigrationAssets = SEA_MIGRATION_ASSETS,
): Promise<void> {
  await migratePg(readEmbeddedMigrationFiles(assets), db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsSchema: MIGRATIONS_SCHEMA,
    migrationsTable: MIGRATIONS_TABLE,
  })
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

  const embedded = isSea()
  log.info(
    'Running database migrations',
    embedded ? { migrationsSource: 'embedded' } : { migrationsFolder: MIGRATIONS_FOLDER },
  )

  try {
    await migrationDb.execute(sql`SELECT pg_advisory_lock(${KOBATO_LOCK_ID}, ${DRIZZLE_LOCK_ID})`)
    locked = true
    if (embedded) {
      // Single-executable build: the `./drizzle` tree is embedded in the
      // binary (`drizzle/<folder>/migration.sql` assets), not on disk.
      await runEmbeddedMigrations(migrationDb)
    } else {
      await migrate(migrationDb, {
        migrationsFolder: MIGRATIONS_FOLDER,
        migrationsSchema: MIGRATIONS_SCHEMA,
        migrationsTable: MIGRATIONS_TABLE,
      })
    }
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
