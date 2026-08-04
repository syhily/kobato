import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import {
  getLocalStorageMigrationStats,
  migrateLocalToS3,
  type MigrationResult,
  type MigrationStats,
} from '@kobato/server/domains/storage/migration'
import { adminProc } from '@kobato/server/http/orpc-base'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { isS3Primary } from '@kobato/server/infra/storage/registry'
import { z } from 'zod'

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

const resultOutput = z.object({
  images: z.number(),
  music: z.number(),
  branding: z.number(),
  backups: z.number(),
  skipped: z.number(),
  failed: z.number(),
})

const migrate = adminProc
  .route({ method: 'POST', path: '/admin/storage/migrate' })
  .output(resultOutput)
  .handler(async ({ context }): Promise<MigrationResult> => {
    if (!isS3Primary()) {
      throw new ActionFailure(409, '请先在设置中启用并配置 S3 存储后再执行迁移。')
    }
    const result = await migrateLocalToS3(context.db)
    recordAuditEventFromContext(context, {
      action: 'storage_migrated_local_to_s3',
      resourceType: 'storage',
      resourceId: 'local',
      details: { ...result },
    })
    return result
  })

export const adminStorageRouter = { stats, migrate }
