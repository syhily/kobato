import { z } from 'zod'

import { recordAuditEvent, recordAuditEventFromContext } from '@/server/domains/audit/service'
import {
  checkPgToolsAvailable,
  createBackup,
  deleteBackup,
  getBackupBuffer,
  listBackups,
  restoreFromBackup,
} from '@/server/domains/backup/service'
import { adminProc } from '@/server/http/orpc-base'
import { getLogger } from '@/server/infra/logger'
import { restartServer } from '@/server/infra/restart'
import { setRestartState } from '@/server/infra/shutdown'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('backup.controller')

const backupFileDto = z.object({
  key: z.string(),
  fileName: z.string(),
  size: z.number(),
  lastModified: z.string(),
})

const status = adminProc
  .route({ method: 'GET', path: '/admin/backup/status' })
  .output(z.object({ s3Enabled: z.boolean(), pgToolsAvailable: z.boolean() }))
  .handler(async () => {
    const bundle = getBlogSettingsBundleSync()
    const s3Enabled = bundle?.assets?.storage.enabled ?? false
    const pgToolsAvailable = await checkPgToolsAvailable()
    return { s3Enabled, pgToolsAvailable }
  })

const list = adminProc
  .route({ method: 'GET', path: '/admin/backup/list' })
  .input(z.object({ limit: z.number().optional(), continuationToken: z.string().optional() }).optional())
  .output(z.object({ files: z.array(backupFileDto), nextContinuationToken: z.string().optional() }))
  .handler(async ({ input }) => {
    const result = await listBackups(input?.limit, input?.continuationToken)
    return result
  })

const create = adminProc
  .route({ method: 'POST', path: '/admin/backup/create' })
  .output(z.object({ fileName: z.string(), size: z.number() }))
  .handler(async ({ context }) => {
    const result = await createBackup()
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
    await deleteBackup(input.key)
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
    const buffer = await getBackupBuffer(input.key)

    // Extract request-scoped values before returning so the background
    // closure does not depend on the oRPC context lifetime.
    const actorId = context.viewer?.userId
    const actorRole = context.viewer?.role ?? null
    const ipAddress = context.clientAddress
    const userAgent = context.request.headers.get('User-Agent')

    setRestartState('restarting')

    // Defer heavy restore work so the HTTP response can be flushed first.
    Promise.resolve()
      .then(async () => {
        await restoreFromBackup(buffer, input.key)
        recordAuditEvent({
          action: 'backup_restored',
          resourceType: 'backup',
          resourceId: input.key,
          actorId,
          actorRole,
          ipAddress,
          userAgent,
        })
        log.info('Restore completed, scheduling server restart', { key: input.key })
        await restartServer()
      })
      .catch((err) => {
        log.error('Background restore failed', {
          key: input.key,
          err: err instanceof Error ? err.message : String(err),
        })
        setRestartState('idle')
      })

    return { accepted: true }
  })

export const adminBackupRouter = { status, list, create, restore, delete: delete_ }
