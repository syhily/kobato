import { resolveStoragePath } from '@kobato/db/database.ts'
import { serverConfig } from '@kobato/server/infra/config.ts'

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
