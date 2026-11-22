import { adminBackupContract } from '@kobato/api/rpc/admin/backup'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { consumeRestoreJobReport, withRestoreClaim } from '@kobato/server/domains/backup/restore-machine'
import {
  beginStagingProgress,
  endStagingProgress,
  peekRestoreProgress,
  reportStagingProgress,
} from '@kobato/server/domains/backup/restore-progress'
import {
  createManualBackup,
  deleteBackup,
  getBackupStream,
  isBackupEncrypted,
  isValidBackupKey,
  listBackups,
  resolveStoredEncryptionPassword,
} from '@kobato/server/domains/backup/services/backup'
import {
  BackupPasswordError,
  EncryptedBackupPasswordRequired,
  restoreFromStagedBackup,
  stageBackup,
} from '@kobato/server/domains/backup/services/restore'
import { decryptParkedUploadAndRestore } from '@kobato/server/domains/backup/upload-restore'
import { implementAdmin, rateLimitByIp } from '@kobato/server/http/orpc-base'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { tryBackupRestorePasswordRateLimit } from '@kobato/server/infra/rate-limit'
import { activeBackend } from '@kobato/server/infra/storage/registry'
import { rmSync } from 'node:fs'

const log = getLogger('backup.controller')

const DECRYPT_RATE_LIMIT_BUCKET = { windowSeconds: 3600, maxAttempts: 30 }

// The decrypt procedure rides its own implementer: router-level `.use` re-positions input validation AFTER the
// leading middlewares, so the limiter burns the budget before parsing (procedure-level `.use` would not).
const impl = implementAdmin({
  status: adminBackupContract.status,
  list: adminBackupContract.list,
  create: adminBackupContract.create,
  restore: adminBackupContract.restore,
  delete: adminBackupContract.delete,
  restoreStatus: adminBackupContract.restoreStatus,
  restoreProgress: adminBackupContract.restoreProgress,
})
const decryptImpl = implementAdmin({ uploadRestoreDecrypt: adminBackupContract.uploadRestoreDecrypt }).use(
  rateLimitByIp('backupRestoreDecrypt', DECRYPT_RATE_LIMIT_BUCKET),
)

const status = impl.status.handler(async () => {
  return { primaryDriver: activeBackend().driver }
})

const list = impl.list.handler(async ({ input, context }) => {
  const result = await listBackups(context.db, input?.limit, input?.continuationToken)
  return result
})

const create = impl.create.handler(async ({ input, context }) => {
  const result = await createManualBackup(context.db, { passwordOverride: input?.password })
  recordAuditEventFromContext(context, {
    action: 'backup_created',
    resourceType: 'backup',
    resourceId: result.fileName,
  })
  return result
})

const delete_ = impl.delete.handler(async ({ input, context }) => {
  if (!isValidBackupKey(input.key)) {
    throw new ActionFailure(400, descriptorFor('backup.error.invalidKey'))
  }
  await deleteBackup(context.db, input.key)
  recordAuditEventFromContext(context, {
    action: 'backup_deleted',
    resourceType: 'backup',
    resourceId: input.key,
  })
  return { success: true }
})

const restore = impl.restore.handler(async ({ input, context }) => {
  if (!isValidBackupKey(input.key)) {
    throw new ActionFailure(400, descriptorFor('backup.error.invalidKey'))
  }
  const encrypted = await isBackupEncrypted(context.db, input.key)
  const trimmedPassword = input.password?.trim()
  const explicitPassword = trimmedPassword !== undefined && trimmedPassword !== '' ? trimmedPassword : null
  const password = explicitPassword ?? (encrypted ? resolveStoredEncryptionPassword() : null)
  if (encrypted && password === null) {
    return { passwordRequired: true }
  }
  if (encrypted && explicitPassword !== null) {
    const passwordLimit = await tryBackupRestorePasswordRateLimit(context.viewer.id, input.key)
    if (passwordLimit.exceeded) {
      throw new ActionFailure(429, descriptorFor('backup.error.passwordAttempts'))
    }
  }

  const outcome = await withRestoreClaim(async () => {
    const { stream } = await getBackupStream(context.db, input.key)
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
      if (error instanceof EncryptedBackupPasswordRequired) {
        rmSync(error.dir, { recursive: true, force: true })
        return null
      }
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
        recordAuditEventFromContext(context, {
          action: 'backup_restored',
          resourceType: 'backup',
          resourceId: input.key,
        })
        log.info('Restore completed', { key: input.key })
      },
      onFailureFn: () => {
        rmSync(staged.dir, { recursive: true, force: true })
      },
    }
  })
  if (outcome === 'busy') {
    throw new ActionFailure(409, descriptorFor('backup.error.restoreRunning'))
  }
  if (outcome === 'declined') {
    return { passwordRequired: true }
  }

  return { accepted: true }
})

const restoreStatus = impl.restoreStatus.handler(async () => {
  return consumeRestoreJobReport()
})

const restoreProgress = impl.restoreProgress.handler(async () => {
  return peekRestoreProgress()
})

const uploadRestoreDecrypt = decryptImpl.uploadRestoreDecrypt.handler(async ({ input, context }) => {
  return decryptParkedUploadAndRestore(input, {
    afterReopen: (_db, fileName) => {
      recordAuditEventFromContext(context, {
        action: 'backup_restored',
        resourceType: 'backup',
        resourceId: fileName,
      })
    },
  })
})

export const adminBackupRouter = {
  ...impl.router({ status, list, create, restore, delete: delete_, restoreStatus, restoreProgress }),
  ...decryptImpl.router({ uploadRestoreDecrypt }),
}
