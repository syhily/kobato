import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { join } from 'node:path'

import type { Database } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'
import { seaVfsRoot } from '@/server/infra/sea'
import { SEA_DRIZZLE_ASSET_PREFIX } from '@/shared/sea/assets'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

const log = getLogger('db:migrations')

/**
 * Migrations folder: under SEA (`useVfs`) the `drizzle/` tree is a real
 * directory in the mounted VFS, so drizzle's own folder reader (plain
 * `node:fs`) works unchanged — there is no separate embedded path.
 */
function migrationsFolder(): string {
  const root = seaVfsRoot()
  return root === null ? MIGRATIONS_FOLDER : join(root, SEA_DRIZZLE_ASSET_PREFIX.replace(/\/$/, ''))
}

/**
 * Migrate the database on the caller's connection — a second connection
 * is wrong for `:memory:`. No advisory locks: runs at boot before traffic.
 */
export async function migrateDatabase(db: Database): Promise<void> {
  const folder = migrationsFolder()
  log.info('Running database migrations', { migrationsFolder: folder, embedded: seaVfsRoot() !== null })

  try {
    migrate(db, { migrationsFolder: folder, migrationsTable: MIGRATIONS_TABLE })
    log.info('Database migrations completed')
  } catch (error) {
    log.error('Database migrations failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
