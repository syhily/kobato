import type { StorageMigrationStatus } from '@kobato/api/contracts/admin/storage'

import { adminStorageContract } from '@kobato/api/rpc/admin/storage'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import {
  cancelStorageMigration,
  getStorageMigrationStatus,
  resumeStorageMigration,
  startStorageMigration,
} from '@kobato/server/domains/storage/s3-migration'
import { getLocalStorageMigrationStats, type MigrationStats } from '@kobato/server/domains/storage/stats'
import { implementAdmin } from '@kobato/server/http/orpc-base'
import { isS3Primary } from '@kobato/server/infra/storage/registry'

const impl = implementAdmin(adminStorageContract)

const stats = impl.stats.handler(async ({ context }): Promise<{ s3Primary: boolean } & MigrationStats> => {
  const counts = await getLocalStorageMigrationStats(context.db)
  return { s3Primary: isS3Primary(), ...counts }
})

const migrationStatus = impl.migrationStatus.handler(async ({ context }): Promise<StorageMigrationStatus> => {
  return getStorageMigrationStatus(context.db)
})

const startMigration = impl.startMigration.handler(async ({ context, input }): Promise<StorageMigrationStatus> => {
  const status = await startStorageMigration(
    context.db,
    input.target === 'local' ? { target: 'local' } : { target: 's3', config: { ...input.config, enabled: true } },
  )
  recordAuditEventFromContext(context, {
    action: 'storage_migration_started',
    resourceType: 'storage',
    resourceId: status.direction,
    details: { direction: status.direction, target: status.target },
  })
  return status
})

const cancelMigration = impl.cancelMigration.handler(async ({ context }): Promise<StorageMigrationStatus> => {
  const status = await cancelStorageMigration(context.db)
  recordAuditEventFromContext(context, {
    action: 'storage_migration_cancel_requested',
    resourceType: 'storage',
    resourceId: status.direction,
  })
  return status
})

const resumeMigration = impl.resumeMigration.handler(async ({ context }): Promise<StorageMigrationStatus> => {
  const status = await resumeStorageMigration(context.db)
  recordAuditEventFromContext(context, {
    action: 'storage_migration_resumed',
    resourceType: 'storage',
    resourceId: status.direction,
  })
  return status
})

export const adminStorageRouter = impl.router({
  stats,
  migrationStatus,
  startMigration,
  cancelMigration,
  resumeMigration,
})
