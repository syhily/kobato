import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'
import type { DuckDBLogger } from '@kobato/db/duckdb/logger'

import { drizzle, migrate } from '@duckdbfan/drizzle-duckdb'
import { engineOf } from '@kobato/db/duckdb/connection'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export const ANALYTICS_MIGRATIONS_TABLE = '__drizzle_migrations'

export interface MigrateAnalyticsDatabaseOptions {
  migrationsFolder?: string
  migrationsRoot?: string
  embedded?: boolean
  logger?: DuckDBLogger
}

export function defaultAnalyticsMigrationsFolder(root?: string): string {
  if (root !== undefined) {
    return join(root, 'duckdb')
  }
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@kobato/db/package.json')), 'drizzle', 'duckdb')
}

export async function migrateAnalyticsDatabase(
  handle: AnalyticsHandle,
  options: MigrateAnalyticsDatabaseOptions = {},
): Promise<void> {
  const folder = options.migrationsFolder ?? defaultAnalyticsMigrationsFolder(options.migrationsRoot)
  const logger = options.logger
  logger?.info('Running analytics database migrations', {
    migrationsFolder: folder,
    embedded: options.embedded === true,
  })
  try {
    await migrate(drizzle(engineOf(handle).writer), {
      migrationsFolder: folder,
      migrationsTable: ANALYTICS_MIGRATIONS_TABLE,
    })
    logger?.info('Analytics database migrations completed')
  } catch (error) {
    logger?.error('Analytics database migrations failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
