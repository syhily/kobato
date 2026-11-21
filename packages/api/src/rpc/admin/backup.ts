import {
  adminBackupCreateInput,
  adminBackupCreateOutputDto,
  adminBackupDeleteInput,
  adminBackupListInput,
  adminBackupListOutputDto,
  adminBackupRestoreInput,
  adminBackupRestoreOutputDto,
  adminBackupStatusOutputDto,
} from '@kobato/api/contracts/backup'
import { successDto } from '@kobato/api/contracts/primitives'
import { oc } from '@orpc/contract'

export const adminBackupContract = {
  status: oc.route({ method: 'GET', path: '/admin/backup/status' }).output(adminBackupStatusOutputDto),
  list: oc
    .route({ method: 'GET', path: '/admin/backup/list' })
    .input(adminBackupListInput)
    .output(adminBackupListOutputDto),
  create: oc
    .route({ method: 'POST', path: '/admin/backup/create' })
    .input(adminBackupCreateInput)
    .output(adminBackupCreateOutputDto),
  restore: oc
    .route({ method: 'POST', path: '/admin/backup/restore' })
    .input(adminBackupRestoreInput)
    .output(adminBackupRestoreOutputDto),
  delete: oc.route({ method: 'POST', path: '/admin/backup/delete' }).input(adminBackupDeleteInput).output(successDto),
}
