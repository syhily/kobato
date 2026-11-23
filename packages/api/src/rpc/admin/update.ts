import {
  adminUpdateApplyInput,
  adminUpdateApplyOutputDto,
  adminUpdateCheckInput,
  adminUpdateStatusInput,
  updateCheckResultDto,
  updateJobStatusDto,
} from '@kobato/api/contracts/admin/update'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminUpdateContract = {
  check: defineProcedure({ method: 'GET', path: '/admin/update/check' })
    .input(adminUpdateCheckInput)
    .output(updateCheckResultDto),
  apply: defineProcedure({ method: 'POST', path: '/admin/update/apply' })
    .input(adminUpdateApplyInput)
    .output(adminUpdateApplyOutputDto),
  status: defineProcedure({ method: 'GET', path: '/admin/update/status' })
    .input(adminUpdateStatusInput)
    .output(updateJobStatusDto),
}
