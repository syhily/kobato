import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { withRestoreClaim } from '@/server/domains/backup/restore-machine'
import {
  createBackup,
  deleteBackup,
  getBackupStream,
  isValidBackupKey,
  listBackups,
} from '@/server/domains/backup/services/backup'
import { restoreFromStagedBackup, stageBackup } from '@/server/domains/backup/services/restore'
import { adminProc } from '@/server/http/orpc-base'
import { ActionFailure } from '@/server/infra/http/errors'
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
    // Claim the restore slot BEFORE the (potentially large) download —
    // check-then-act across an await races a second restore into the
    // same staging path. The machine owns the claim/abort choreography.
    const outcome = await withRestoreClaim(async () => {
      const stream = await getBackupStream(context.db, input.key)
      const staged = await stageBackup(stream)
      return {
        restoreFn: async () => {
          await restoreFromStagedBackup(staged, input.key)
        },
        afterReopenFn: async () => {
          // The audit event buffers into the re-initialized batcher, which
          // writes to the restored database.
          recordAuditEventFromContext(context, {
            action: 'backup_restored',
            resourceType: 'backup',
            resourceId: input.key,
          })
          log.info('Restore completed', { key: input.key })
        },
      }
    })
    if (outcome === 'busy') {
      throw new ActionFailure(409, '已有还原任务正在进行，请等待完成后再试。')
    }

    return { accepted: true }
  })

export const adminBackupRouter = { status, list, create, restore, delete: delete_ }
