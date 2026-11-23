import { BACKUP_FILE_MAX_BYTES } from '@kobato/api/contracts/account/setup'
import {
  adminBackupCreateInput,
  adminBackupCreateOutputDto,
  adminBackupDeleteInput,
  adminBackupDownloadInput,
  adminBackupDownloadOutput,
  adminBackupListInput,
  adminBackupListOutputDto,
  adminBackupRestoreInput,
  adminBackupRestoreOutputDto,
  adminBackupStatusOutputDto,
  adminBackupUploadRestoreDecryptInput,
  adminBackupUploadRestoreDecryptOutputDto,
  adminBackupUploadRestoreInput,
  adminBackupUploadRestoreOutputDto,
  restoreJobStatusDto,
  restoreProgressDto,
} from '@kobato/api/contracts/admin/backup'
import { successDto } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const ADMIN_BACKUP_DOWNLOAD_RPC_PATH = '/rpc/admin/backup/download'

export const adminBackupContract = {
  status: defineProcedure({ method: 'GET', path: '/admin/backup/status' }).output(adminBackupStatusOutputDto),
  list: defineProcedure({ method: 'GET', path: '/admin/backup/list' })
    .input(adminBackupListInput)
    .output(adminBackupListOutputDto),
  create: defineProcedure({ method: 'POST', path: '/admin/backup/create' })
    .input(adminBackupCreateInput)
    .output(adminBackupCreateOutputDto),
  restore: defineProcedure({ method: 'POST', path: '/admin/backup/restore' })
    .input(adminBackupRestoreInput)
    .output(adminBackupRestoreOutputDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/backup/delete' })
    .input(adminBackupDeleteInput)
    .output(successDto),
  restoreStatus: defineProcedure({ method: 'GET', path: '/admin/backup/restore-status' }).output(restoreJobStatusDto),
  restoreProgress: defineProcedure({ method: 'GET', path: '/admin/backup/restore-progress' }).output(
    restoreProgressDto,
  ),
  uploadRestoreDecrypt: defineProcedure(
    { method: 'POST', path: '/admin/backup/upload-restore/decrypt' },
    {
      requestTimeoutMs: 30 * 60_000,
      requestBodyLimit: { maxBytes: 64 * 1024, messageKey: 'error.api.payloadTooLarge' },
    },
  )
    .input(adminBackupUploadRestoreDecryptInput)
    .output(adminBackupUploadRestoreDecryptOutputDto),
  uploadRestore: defineProcedure(
    { method: 'POST', path: '/admin/backup/upload-restore' },
    {
      requestTimeoutMs: 30 * 60_000,
      requestBodyLimit: { maxBytes: BACKUP_FILE_MAX_BYTES, messageKey: 'backup.error.uploadTooLarge' },
    },
  )
    .input(adminBackupUploadRestoreInput)
    .output(adminBackupUploadRestoreOutputDto),
  download: defineProcedure({ method: 'GET', path: '/admin/backup/download/:timestamp' }, { csrfExempt: true })
    .input(adminBackupDownloadInput)
    .output(adminBackupDownloadOutput),
}
