import type { Database } from '@kobato/db/sqlite/database'
import type { StagedBackup } from '@kobato/server/domains/backup/services/restore'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import {
  claimEncryptedUploadForDecrypt,
  endDecryptClaim,
  parkEncryptedUpload,
  releaseEncryptedUpload,
} from '@kobato/server/domains/backup/pending-uploads'
import { withRestoreClaim } from '@kobato/server/domains/backup/restore-machine'
import {
  beginStagingProgress,
  endStagingProgress,
  reportStagingProgress,
} from '@kobato/server/domains/backup/restore-progress'
import {
  assertStagedBackupContainsAdmin,
  BackupPasswordError,
  EncryptedBackupPasswordRequired,
  restoreFromStagedBackup,
  stageBackup,
} from '@kobato/server/domains/backup/services/restore'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { createReadStream, rmSync } from 'node:fs'
import { Readable } from 'node:stream'

const log = getLogger('backup.upload-restore')

/** Runs after the engines reopen, inside the restore machine — the perimeter records its audit here. */
export type StagedRestoreAfterReopen = (db: Database, fileName: string) => Promise<void> | void

export interface StagedRestoreOptions {
  withAnalytics?: boolean
  afterReopen?: StagedRestoreAfterReopen
}

export interface StageUploadedBackupOptions {
  allowAnalyticsOnly: boolean
  password?: string
  parkEncrypted?: boolean
}

export async function stageUploadedBackup(
  file: File,
  options: StageUploadedBackupOptions,
): Promise<StagedBackup | { encrypted: true; token: string }> {
  const progressOwned = beginStagingProgress()
  let staged: StagedBackup
  try {
    staged = await stageBackup(Readable.fromWeb(unsafeCast<WebReadableStream>(file.stream())), {
      password: options.password,
      onProgress: progressOwned
        ? (stage, doneBytes, totalBytes) => reportStagingProgress(stage, doneBytes, totalBytes)
        : undefined,
    })
  } catch (error) {
    if (error instanceof EncryptedBackupPasswordRequired) {
      if (options.parkEncrypted === false) {
        rmSync(error.dir, { recursive: true, force: true })
        throw new ActionFailure(400, descriptorFor('backup.error.passwordMissingUpload'))
      }
      try {
        const token = parkEncryptedUpload({ dir: error.dir, uploadPath: error.uploadPath, fileName: file.name })
        return { encrypted: true, token }
      } catch (parkError) {
        rmSync(error.dir, { recursive: true, force: true })
        throw parkError
      }
    }
    if (error instanceof ActionFailure) {
      throw error
    }
    throw new ActionFailure(400, descriptorFor('backup.error.invalidFile'))
  } finally {
    if (progressOwned) {
      endStagingProgress()
    }
  }
  if (!options.allowAnalyticsOnly || staged.content !== null) {
    try {
      await assertStagedBackupContainsAdmin(staged)
    } catch {
      rmSync(staged.dir, { recursive: true, force: true })
      throw new ActionFailure(400, descriptorFor('backup.error.invalidFileNoAdmin'))
    }
  }
  return staged
}

/**
 * Claims the single restore slot for an already-staged upload and starts the background job.
 * A busy slot sweeps the staged dir — the caller can only answer a conflict.
 */
export async function startRestoreFromStaged(
  staged: StagedBackup,
  fileName: string,
  options: StagedRestoreOptions = {},
): Promise<'started' | 'busy'> {
  const outcome = await withRestoreClaim(async () => ({
    restoreFn: async () => {
      const result = await restoreFromStagedBackup(staged, fileName, { withAnalytics: options.withAnalytics })
      log.info('Restore from uploaded backup completed', { configApplied: result.configApplied })
      return result
    },
    afterReopenFn:
      options.afterReopen === undefined
        ? undefined
        : async (db: Database) => {
            await options.afterReopen?.(db, fileName)
          },
    onFailureFn: () => {
      rmSync(staged.dir, { recursive: true, force: true })
    },
  }))
  if (outcome === 'busy') {
    rmSync(staged.dir, { recursive: true, force: true })
    return 'busy'
  }
  return 'started'
}

export async function restoreSetupUploadedBackup(
  staged: StagedBackup,
  fileName: string,
  afterReopen: (db: Database) => Promise<void> | void,
): Promise<{ accepted: true }> {
  const outcome = await withRestoreClaim(async () => ({
    restoreFn: () => restoreFromStagedBackup(staged, fileName, { withAnalytics: false }),
    afterReopenFn: async (db) => afterReopen(db),
    onFailureFn: () => {
      rmSync(staged.dir, { recursive: true, force: true })
    },
  }))
  if (outcome === 'busy') {
    rmSync(staged.dir, { recursive: true, force: true })
    throw new ActionFailure(409, descriptorFor('backup.error.restoreRunning'))
  }
  return { accepted: true }
}

export async function decryptParkedUploadAndRestore(
  input: { token: string; password: string },
  options: Pick<StagedRestoreOptions, 'afterReopen'> = {},
): Promise<{ accepted: true }> {
  const { token, password } = input
  if (token === '' || password === '') {
    throw new ActionFailure(400, descriptorFor('backup.error.passwordMissing'))
  }
  if (password.length > 512) {
    throw new ActionFailure(400, descriptorFor('backup.error.passwordTooLong'))
  }

  const claim = claimEncryptedUploadForDecrypt(token)
  if (!claim.ok) {
    if (claim.reason === 'in-flight') {
      throw new ActionFailure(409, descriptorFor('backup.error.decryptInProgress'))
    }
    throw new ActionFailure(410, descriptorFor('backup.error.uploadExpired'))
  }
  const parked = claim.entry

  let fate: 'keep' | 'release' = 'release'
  try {
    const progressOwned = beginStagingProgress()
    let staged: StagedBackup
    try {
      staged = await stageBackup(createReadStream(parked.uploadPath), {
        password,
        onProgress: progressOwned
          ? (stage, doneBytes, totalBytes) => reportStagingProgress(stage, doneBytes, totalBytes)
          : undefined,
      })
    } catch (error) {
      if (error instanceof BackupPasswordError) {
        fate = 'keep'
        throw error
      }
      if (error instanceof ActionFailure) {
        throw new ActionFailure(410, error.descriptor ?? error.message, error.issues)
      }
      throw new ActionFailure(410, descriptorFor('backup.error.invalidFileReupload'))
    } finally {
      if (progressOwned) {
        endStagingProgress()
      }
    }

    try {
      await assertStagedBackupContainsAdmin(staged)
    } catch {
      rmSync(staged.dir, { recursive: true, force: true })
      throw new ActionFailure(410, descriptorFor('backup.error.invalidFileNoAdminReupload'))
    }

    const outcome = await startRestoreFromStaged(staged, parked.fileName, { afterReopen: options.afterReopen })
    if (outcome === 'busy') {
      fate = 'keep'
      throw new ActionFailure(409, descriptorFor('backup.error.restoreRunning'))
    }
    return { accepted: true }
  } finally {
    if (fate === 'keep') {
      endDecryptClaim(token)
    } else {
      releaseEncryptedUpload(token)
    }
  }
}
