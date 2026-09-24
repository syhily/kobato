import { rmSync } from 'node:fs'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { withRestoreClaim } from '@/server/domains/backup/restore-machine'
import {
  beginStagingProgress,
  endStagingProgress,
  reportStagingProgress,
} from '@/server/domains/backup/restore-progress'
import {
  createManualBackup,
  deleteBackup,
  getBackupStream,
  isBackupEncrypted,
  isValidBackupKey,
  listBackups,
  resolveStoredEncryptionPassword,
} from '@/server/domains/backup/services/backup'
import {
  BackupPasswordError,
  EncryptedBackupPasswordRequired,
  restoreFromStagedBackup,
  stageBackup,
} from '@/server/domains/backup/services/restore'
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
  encrypted: z.boolean(),
})

const status = adminProc
  .route({ method: 'GET', path: '/admin/backup/status' })
  .output(z.object({ primaryDriver: z.enum(['s3', 'local']) }))
  .handler(async () => {
    // Backups land in local storage when S3 is unconfigured; `primaryDriver` is informational only.
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
  // Optional per-backup password override; absent = the settings encryption
  // password. Same floor as the settings schema — a one-off password is
  // never stored, so a weak one only buys an unrestorable archive.
  .input(z.object({ password: z.string().min(8, '备份加密密码至少 8 位').max(512).optional() }).optional())
  .output(z.object({ fileName: z.string(), size: z.number(), timestamp: z.string() }))
  .handler(async ({ input, context }) => {
    const result = await createManualBackup(context.db, { passwordOverride: input?.password })
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
  .input(z.object({ key: z.string(), password: z.string().max(512).optional() }))
  .output(z.union([z.object({ accepted: z.boolean() }), z.object({ passwordRequired: z.boolean() })]))
  .handler(async ({ input, context }) => {
    if (!isValidBackupKey(input.key)) {
      throw new ActionFailure(400, '无效的备份标识。')
    }
    // Resolve the password BEFORE claiming the slot: an encrypted archive
    // without any usable password declines without touching the machine.
    // Trim like the create path does, so both sides derive the same key.
    const encrypted = await isBackupEncrypted(context.db, input.key)
    const trimmedPassword = input.password?.trim()
    const explicitPassword = trimmedPassword !== undefined && trimmedPassword !== '' ? trimmedPassword : null
    const password = explicitPassword ?? (encrypted ? resolveStoredEncryptionPassword() : null)
    if (encrypted && password === null) {
      return { passwordRequired: true }
    }

    // Claim BEFORE the (potentially large) download — check-then-act across an
    // await races a second restore into the same staging path.
    const outcome = await withRestoreClaim(async () => {
      const { stream } = await getBackupStream(context.db, input.key)
      // Report the staging legs (decrypt/extract) through the same progress
      // slot the upload flow uses — peekRestoreProgress prefers staging over
      // the machine's (premature) 'draining' phase during this window.
      const progressOwned = beginStagingProgress()
      let staged
      try {
        staged = await stageBackup(stream, {
          password: password ?? undefined,
          onProgress: progressOwned
            ? (stage, doneBytes, totalBytes) => reportStagingProgress(stage, doneBytes, totalBytes)
            : undefined,
        })
      } catch (error) {
        // The row said "not encrypted" but the bytes are (out-of-band bucket
        // edits): no password could possibly have worked — sweep the staged
        // dir (nothing to park here; the source lives in storage) and ask.
        if (error instanceof EncryptedBackupPasswordRequired) {
          rmSync(error.dir, { recursive: true, force: true })
          return null
        }
        // The stored password didn't fit (e.g. the backup used a one-off
        // override): ask the user instead of failing hard. Only a genuine
        // password failure declines — structural corruption fails loudly.
        if (encrypted && explicitPassword === null && error instanceof BackupPasswordError) {
          return null
        }
        throw error
      } finally {
        if (progressOwned) {
          endStagingProgress()
        }
      }
      return {
        restoreFn: () => restoreFromStagedBackup(staged, input.key),
        afterReopenFn: async () => {
          // The audit event buffers into the re-initialized batcher, writing to the restored DB.
          recordAuditEventFromContext(context, {
            action: 'backup_restored',
            resourceType: 'backup',
            resourceId: input.key,
          })
          log.info('Restore completed', { key: input.key })
        },
        // A pre-swap throw (drain/prepareForSwap) means the swap never ran
        // — drop the staged dir instead of leaking it until the next boot.
        onFailureFn: () => {
          rmSync(staged.dir, { recursive: true, force: true })
        },
      }
    })
    if (outcome === 'busy') {
      throw new ActionFailure(409, '已有还原任务正在进行，请等待完成后再试。')
    }
    if (outcome === 'declined') {
      return { passwordRequired: true }
    }

    return { accepted: true }
  })

export const adminBackupRouter = { status, list, create, restore, delete: delete_ }
