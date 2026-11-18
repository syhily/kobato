import {
  adminBackupCreateInput,
  adminBackupCreateOutputDto,
  adminBackupDeleteInput,
  adminBackupListInput,
  adminBackupListOutputDto,
  adminBackupRestoreInput,
  adminBackupRestoreOutputDto,
  adminBackupStatusOutputDto,
} from '@kobato/contracts/backup.ts'
import { successDto } from '@kobato/contracts/primitives.ts'
import { oc } from '@orpc/contract'

// Admin backup RPC contract — admin base on the server. The upload-restore
// Hono resource route (multipart) stays outside oRPC; these procedures drive
// create/list/delete/restore plus the primary-driver status.
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
