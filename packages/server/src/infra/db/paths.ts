import { resolveStoragePath } from '@kobato/db/database.ts'
import { serverConfig } from '@kobato/server/infra/config.ts'

export function resolveEnginePath(configured: string, fallbackName: string): string {
  return resolveStoragePath(configured, fallbackName, serverConfig.storage.data)
}

export function resolveDatabasePath(): string {
  return resolveEnginePath(serverConfig.storage.database, 'kobato.db')
}

export function resolveAnalyticsPath(): string {
  return resolveEnginePath(serverConfig.storage.analyticsDatabase, 'analytics.duckdb')
}
