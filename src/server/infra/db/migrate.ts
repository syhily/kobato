import type { MigrationMeta } from 'drizzle-orm/migrator'

import { formatToMillis } from 'drizzle-orm/migrator.utils'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { migrateSync } from 'drizzle-orm/sqlite-core/async/session'
import { createHash } from 'node:crypto'

import type { Database } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'
import { getEmbeddedAsset, isSea, listEmbeddedAssetKeys } from '@/server/infra/sea'
import { requireEmbeddedAssetText } from '@/server/infra/sea-asset'
import { SEA_DRIZZLE_ASSET_PREFIX } from '@/shared/sea/assets'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

const log = getLogger('db:migrations')

// Embedded asset keys: `<SEA_DRIZZLE_ASSET_PREFIX><folder>/migration.sql` (prefix owned by `@/shared/sea/assets`).
const MIGRATION_SQL_SUFFIX = '/migration.sql'

/** Asset source for the embedded migration reader (SEA blob in prod, `drizzle/` tree in tests). */
export interface EmbeddedMigrationAssets {
  listKeys(prefix: string): string[]
  getAsset(key: string): Buffer | null
}

const SEA_MIGRATION_ASSETS: EmbeddedMigrationAssets = {
  listKeys: listEmbeddedAssetKeys,
  getAsset: getEmbeddedAsset,
}

/**
 * SEA-mode counterpart of drizzle's `readMigrationFiles`, reading
 * embedded assets; the list is executed by drizzle's own `migrateSync`.
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
 * tests (folder/embedded equivalence).
 */
export function runEmbeddedMigrations(db: Database, assets: EmbeddedMigrationAssets = SEA_MIGRATION_ASSETS): void {
  // `session` is @internal on the type; drizzle's own migrator reaches it the same way.
  const session = unsafeCast<{ session: Parameters<typeof migrateSync>[1] }>(db).session
  migrateSync(readEmbeddedMigrationFiles(assets), session, { migrationsTable: MIGRATIONS_TABLE })
}

/**
 * Migrate the database on the caller's connection — a second connection
 * is wrong for `:memory:`. No advisory locks: runs at boot before traffic.
 */
export async function migrateDatabase(db: Database): Promise<void> {
  const embedded = isSea()
  log.info(
    'Running database migrations',
    embedded ? { migrationsSource: 'embedded' } : { migrationsFolder: MIGRATIONS_FOLDER },
  )

  try {
    if (embedded) {
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
