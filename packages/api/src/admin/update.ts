import {
  adminUpdateApplyInput,
  adminUpdateApplyOutputDto,
  adminUpdateCheckInput,
  adminUpdateStatusInput,
  updateCheckResultDto,
  updateJobStatusDto,
} from '@kobato/contracts/update.ts'
import { oc } from '@orpc/contract'

// Admin self-update RPC contract — admin base on the server.
export const adminUpdateContract = {
  check: oc
    .route({ method: 'GET', path: '/admin/update/check' })
    .input(adminUpdateCheckInput)
    .output(updateCheckResultDto),
  apply: oc
    .route({ method: 'POST', path: '/admin/update/apply' })
    .input(adminUpdateApplyInput)
    .output(adminUpdateApplyOutputDto),
  status: oc
    .route({ method: 'GET', path: '/admin/update/status' })
    .input(adminUpdateStatusInput)
    .output(updateJobStatusDto),
}
