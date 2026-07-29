import { z } from 'zod'

import { prepareDatabaseForRestore, reopenDb } from '@/server/bootstrap/db-lifecycle'
import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { performSafeRestore } from '@/server/domains/backup/restore-orchestrator'
import {
  createBackup,
  deleteBackup,
  getBackupBuffer,
  isValidBackupKey,
  listBackups,
} from '@/server/domains/backup/services/backup'
import { restoreFromBackup } from '@/server/domains/backup/services/restore'
import { adminProc } from '@/server/http/orpc-base'
import { ActionFailure } from '@/server/infra/http/errors'
import { getRestoreState } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { activeBackend } from '@/server/infra/storage/registry'

const log = getLogger('backup.controller')

const backupFileDto = z.object({
  key: z.string(),
  fileName: z.string(),
  size: z.number(),
  lastModified: z.string(),
})

const status = adminProc
  .route({ method: 'GET', path: '/admin/backup/status' })
  .output(z.object({ primaryDriver: z.enum(['s3', 'local']) }))
  .handler(async () => {
    // Backups run regardless of storage: when S3 is unconfigured they land
    // in local storage. `primaryDriver` is informational only (shown in the
    // UI as "where new backups go"); file-based backups need no external
    // tooling, so there is no availability gate anymore.
    return { primaryDriver: activeBackend().driver }
  })

const list = adminProc
  .route({ method: 'GET', path: '/admin/backup/list' })
  .input(z.object({ limit: z.number().optional(), continuationToken: z.string().optional() }).optional())
  .output(z.object({ files: z.array(backupFileDto), nextContinuationToken: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const result = await listBackups(context.db, input?.limit, input?.continuationToken)
    return result
  })

const create = adminProc
  .route({ method: 'POST', path: '/admin/backup/create' })
  .output(z.object({ fileName: z.string(), size: z.number(), timestamp: z.string() }))
  .handler(async ({ context }) => {
    const result = await createBackup(context.db, null)
    recordAuditEventFromContext(context, {
      action: 'backup_created',
      resourceType: 'backup',
      resourceId: result.fileName,
    })
    return result
  })

const delete_ = adminProc
  .route({ method: 'POST', path: '/admin/backup/delete' })
  .input(z.object({ key: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    if (!isValidBackupKey(input.key)) {
      throw new ActionFailure(400, '无效的备份标识。')
    }
    await deleteBackup(context.db, input.key)
    recordAuditEventFromContext(context, {
      action: 'backup_deleted',
      resourceType: 'backup',
      resourceId: input.key,
    })
    return { success: true }
  })

const restore = adminProc
  .route({ method: 'POST', path: '/admin/backup/restore' })
  .input(z.object({ key: z.string() }))
  .output(z.object({ accepted: z.boolean() }))
  .handler(async ({ input, context }) => {
    if (!isValidBackupKey(input.key)) {
      throw new ActionFailure(400, '无效的备份标识。')
    }
    if (getRestoreState().phase !== 'idle') {
      throw new ActionFailure(409, '已有还原任务正在进行，请等待完成后再试。')
    }

    const { db } = context
    const buffer = await getBackupBuffer(db, input.key)

    performSafeRestore(
      { prepareForSwap: prepareDatabaseForRestore, reopenAfterSwap: reopenDb, log },
      async () => {
        await restoreFromBackup(buffer, input.key)
      },
      async () => {
        // The audit event buffers into the re-initialized batcher, which
        // writes to the restored database.
        recordAuditEventFromContext(context, {
          action: 'backup_restored',
          resourceType: 'backup',
          resourceId: input.key,
        })
        log.info('Restore completed', { key: input.key })
      },
    )

    return { accepted: true }
  })

export const adminBackupRouter = { status, list, create, restore, delete: delete_ }
