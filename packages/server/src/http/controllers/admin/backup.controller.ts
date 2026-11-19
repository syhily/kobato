import { adminBackupContract } from '@kobato/api/admin/backup.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { withRestoreClaim } from '@kobato/server/domains/backup/restore-machine.ts'
import {
  beginStagingProgress,
  endStagingProgress,
  reportStagingProgress,
} from '@kobato/server/domains/backup/restore-progress.ts'
import {
  createManualBackup,
  deleteBackup,
  getBackupStream,
  isBackupEncrypted,
  isValidBackupKey,
  listBackups,
  resolveStoredEncryptionPassword,
} from '@kobato/server/domains/backup/services/backup.ts'
import {
  BackupPasswordError,
  EncryptedBackupPasswordRequired,
  restoreFromStagedBackup,
  stageBackup,
} from '@kobato/server/domains/backup/services/restore.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { ActionFailure } from '@kobato/server/infra/http/errors.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { tryBackupRestorePasswordRateLimit } from '@kobato/server/infra/rate-limit.ts'
import { activeBackend } from '@kobato/server/infra/storage/registry.ts'
import { rmSync } from 'node:fs'

const log = getLogger('backup.controller')

const impl = implementAdmin(adminBackupContract)

const status = impl.status.handler(async () => {
  // Backups land in local storage when S3 is unconfigured; `primaryDriver` is informational only.
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
  // An explicit password guess is an online oracle for the archive key —
  // cap tries per (admin, backup). The stored-settings password path stays
  // exempt: it is one fixed candidate, not a guess.
  if (encrypted && explicitPassword !== null) {
    const passwordLimit = await tryBackupRestorePasswordRateLimit(context.viewer.id, input.key)
    if (passwordLimit.exceeded) {
      throw new ActionFailure(429, descriptorFor('backup.error.passwordAttempts'))
    }
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
    throw new ActionFailure(409, descriptorFor('backup.error.restoreRunning'))
  }
  if (outcome === 'declined') {
    return { passwordRequired: true }
  }

  return { accepted: true }
})

export const adminBackupRouter = impl.router({ status, list, create, restore, delete: delete_ })
