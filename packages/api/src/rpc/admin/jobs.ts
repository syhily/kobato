import { jobHistoryInput, jobHistoryOutput, jobsListDto } from '@kobato/api/contracts/jobs'
import { oc } from '@orpc/contract'

export const adminJobsContract = {
  list: oc.route({ method: 'GET', path: '/admin/jobs/list' }).output(jobsListDto),
  history: oc.route({ method: 'GET', path: '/admin/jobs/history' }).input(jobHistoryInput).output(jobHistoryOutput),
}
