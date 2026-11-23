import { jobHistoryInput, jobHistoryOutput, jobsListDto } from '@kobato/api/contracts/admin/jobs'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminJobsContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/jobs/list' }).output(jobsListDto),
  history: defineProcedure({ method: 'GET', path: '/admin/jobs/history' })
    .input(jobHistoryInput)
    .output(jobHistoryOutput),
}
