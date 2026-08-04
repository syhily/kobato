import type { Database } from '@kobato/server/infra/db/database'
import type { MigrationMeta } from 'drizzle-orm/migrator'

import { getLogger } from '@kobato/server/infra/logger'
import { getEmbeddedAsset, isSea, listEmbeddedAssetKeys } from '@kobato/server/infra/sea'
import { requireEmbeddedAssetText } from '@kobato/server/infra/sea-asset'
import { SEA_DRIZZLE_ASSET_PREFIX } from '@kobato/shared/sea/assets'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { formatToMillis } from 'drizzle-orm/migrator.utils'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { migrateSync } from 'drizzle-orm/sqlite-core/async/session'
import { createHash } from 'node:crypto'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

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
 * 14-digit timestamp prefix. Engine-agnostic — the returned list is
 * executed by drizzle's own `migrateSync` (`sqlite-core/async/session`)
 * so statement splitting, transaction behavior, and
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
 * Run the embedded-asset migration path on an open handle. Exported for
 * tests (folder/embedded equivalence); production code enters through
 * `migrateDatabase`.
 */
export function runEmbeddedMigrations(db: Database, assets: EmbeddedMigrationAssets = SEA_MIGRATION_ASSETS): void {
  // `session` is an @internal constructor param on SQLiteAsyncDatabase —
  // not a public property on the type — but drizzle's own node-sqlite
  // migrator reaches it the same way at runtime
  // (node_modules/drizzle-orm/node-sqlite/migrator.js).
  const session = unsafeCast<{ session: Parameters<typeof migrateSync>[1] }>(db).session
  migrateSync(readEmbeddedMigrationFiles(assets), session, { migrationsTable: MIGRATIONS_TABLE })
}

/**
 * Migrate the database behind an open handle. Runs on the caller's
 * connection (the single-writer model makes a second connection
 * pointless — and wrong for `:memory:`, where a new connection would see
 * a different, empty database). No advisory locks: migrations run at
 * boot before the server accepts traffic, inside one transaction.
 */
export async function migrateDatabase(db: Database): Promise<void> {
  const embedded = isSea()
  log.info(
    'Running database migrations',
    embedded ? { migrationsSource: 'embedded' } : { migrationsFolder: MIGRATIONS_FOLDER },
  )

  try {
    if (embedded) {
      // Single-executable build: the `./drizzle` tree is embedded in the
      // binary (`drizzle/<folder>/migration.sql` assets), not on disk.
      runEmbeddedMigrations(db)
    } else {
      migrate(db, {
        migrationsFolder: MIGRATIONS_FOLDER,
        migrationsTable: MIGRATIONS_TABLE,
      })
    }
    log.info('Database migrations completed')
  } catch (error) {
    log.error('Database migrations failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
