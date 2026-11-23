import {
  adminBackupCreateInput,
  adminBackupCreateOutputDto,
  adminBackupDeleteInput,
  adminBackupListInput,
  adminBackupListOutputDto,
  adminBackupRestoreInput,
  adminBackupRestoreOutputDto,
  adminBackupStatusOutputDto,
  adminBackupUploadRestoreDecryptInput,
  adminBackupUploadRestoreDecryptOutputDto,
  restoreJobStatusDto,
  restoreProgressDto,
} from '@kobato/api/contracts/admin/backup'
import { successDto } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

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
  uploadRestoreDecrypt: defineProcedure({ method: 'POST', path: '/admin/backup/upload-restore/decrypt' })
    .input(adminBackupUploadRestoreDecryptInput)
    .output(adminBackupUploadRestoreDecryptOutputDto),
}
