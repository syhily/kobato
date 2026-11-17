import type { Database } from '@kobato/db/database.ts'

import { defaultMigrationsFolder, migrateDatabase as runMigrations } from '@kobato/db/migrate.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { seaVfsRoot } from '@kobato/server/infra/sea.ts'
import { SEA_DRIZZLE_ASSET_PREFIX } from '@kobato/shared/sea/assets.ts'
import { join } from 'node:path'

const log = getLogger('db:migrations')

/**
 * Under SEA (`useVfs`) the `drizzle/` tree is a real directory in the mounted
 * VFS, so drizzle's own folder reader (plain `node:fs`) works unchanged.
 */
function migrationsFolder(): string {
  const root = seaVfsRoot()
  return root === null ? defaultMigrationsFolder() : join(root, SEA_DRIZZLE_ASSET_PREFIX.replace(/\/$/, ''))
}

/**
 * Migrate on the caller's connection — a second connection is wrong for
 * `:memory:`. No advisory locks: runs at boot, before traffic.
 */
export async function migrateDatabase(db: Database): Promise<void> {
  const folder = migrationsFolder()
  log.info('Running database migrations', { migrationsFolder: folder, embedded: seaVfsRoot() !== null })

  try {
    runMigrations(db, folder)
    log.info('Database migrations completed')
  } catch (error) {
    log.error('Database migrations failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
