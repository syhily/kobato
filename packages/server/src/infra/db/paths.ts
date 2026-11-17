import { resolveStoragePath } from '@kobato/db/database.ts'
import { serverConfig } from '@kobato/server/infra/config.ts'

/** Shared storage-path resolution for both embedded engines. */
export function resolveEnginePath(configured: string, fallbackName: string): string {
  return resolveStoragePath(configured, fallbackName, serverConfig.storage.data)
}

/** The content DB path (one shared in-memory DB per process when `:memory:`). */
export function resolveDatabasePath(): string {
  return resolveEnginePath(serverConfig.storage.database, 'kobato.db')
}
