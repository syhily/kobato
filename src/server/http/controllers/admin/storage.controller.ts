import { z } from 'zod'

import type { StorageMigrationStatus } from '@/shared/contracts/storage'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import {
  cancelStorageMigration,
  getStorageMigrationStatus,
  resumeStorageMigration,
  startStorageMigration,
} from '@/server/domains/storage/s3-migration'
import { getLocalStorageMigrationStats, type MigrationStats } from '@/server/domains/storage/stats'
import { adminProc } from '@/server/http/orpc-base'
import { isS3Primary } from '@/server/infra/storage/registry'
import { storageMigrationStatusDto } from '@/shared/contracts/storage'

const statsOutput = z.object({
  s3Primary: z.boolean(),
  images: z.number(),
  music: z.number(),
  branding: z.number(),
  backups: z.number(),
})

const stats = adminProc
  .route({ method: 'GET', path: '/admin/storage/migration-stats' })
  .output(statsOutput)
  .handler(async ({ context }): Promise<{ s3Primary: boolean } & MigrationStats> => {
    const counts = await getLocalStorageMigrationStats(context.db)
    return { s3Primary: isS3Primary(), ...counts }
  })

const migrationStatus = adminProc
  .route({ method: 'GET', path: '/admin/storage/migration-status' })
  .output(storageMigrationStatusDto)
  .handler(async ({ context }): Promise<StorageMigrationStatus> => {
    return getStorageMigrationStatus(context.db)
  })

const s3TargetConfigInput = z.object({
  endpoint: z.url(),
  region: z.string().trim().min(1).max(60),
  bucket: z.string().trim().min(1).max(120),
  accessKeyId: z.string().trim().min(1).max(255),
  secretAccessKey: z.string().trim().min(1).max(512),
  forcePathStyle: z.boolean(),
  urlTemplate: z.string().trim().max(500),
})

const startMigrationInput = z.discriminatedUnion('target', [
  z.object({ target: z.literal('local') }),
  z.object({ target: z.literal('s3'), config: s3TargetConfigInput }),
])

const startMigration = adminProc
  .route({ method: 'POST', path: '/admin/storage/migration/start' })
  .input(startMigrationInput)
  .output(storageMigrationStatusDto)
  .handler(async ({ context, input }): Promise<StorageMigrationStatus> => {
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

const cancelMigration = adminProc
  .route({ method: 'POST', path: '/admin/storage/migration/cancel' })
  .output(storageMigrationStatusDto)
  .handler(async ({ context }): Promise<StorageMigrationStatus> => {
    const status = await cancelStorageMigration(context.db)
    recordAuditEventFromContext(context, {
      action: 'storage_migration_cancel_requested',
      resourceType: 'storage',
      resourceId: status.direction,
    })
    return status
  })

const resumeMigration = adminProc
  .route({ method: 'POST', path: '/admin/storage/migration/resume' })
  .output(storageMigrationStatusDto)
  .handler(async ({ context }): Promise<StorageMigrationStatus> => {
    const status = await resumeStorageMigration(context.db)
    recordAuditEventFromContext(context, {
      action: 'storage_migration_resumed',
      resourceType: 'storage',
      resourceId: status.direction,
    })
    return status
  })

export const adminStorageRouter = { stats, migrationStatus, startMigration, cancelMigration, resumeMigration }
