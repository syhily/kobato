import { resolveStoragePath } from '@kobato/db/sqlite/database'
import { SEA_DRIZZLE_ASSET_PREFIX } from '@kobato/distribution/sea-assets'
import { serverConfig } from '@kobato/server/infra/config'
import { seaAssetPath } from '@kobato/server/infra/sea/sea'

let testPaths: { database: string; analytics: string } | null = null

export function __setEnginePathsForTests(paths: { database: string; analytics: string } | null): void {
  testPaths = paths
}

export function resolveEnginePath(configured: string, fallbackName: string): string {
  return resolveStoragePath(configured, fallbackName, serverConfig.storage.data)
}

export function resolveDatabasePath(): string {
  return testPaths?.database ?? resolveEnginePath(serverConfig.storage.database, 'kobato.db')
}

export function resolveAnalyticsPath(): string {
  return testPaths?.analytics ?? resolveEnginePath(serverConfig.storage.analyticsDatabase, 'analytics.duckdb')
}

export function resolveEmbeddedMigrationsRoot(): string | null {
  return seaAssetPath(SEA_DRIZZLE_ASSET_PREFIX.replace(/\/$/, ''))
}
