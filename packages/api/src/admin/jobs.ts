import { jobHistoryInput, jobHistoryOutput, jobsListDto } from '@kobato/contracts/jobs.ts'
import { oc } from '@orpc/contract'

// Admin jobs RPC contract — admin base on the server. The task-center list
// takes no input; it aggregates the whole catalog.
export const adminJobsContract = {
  list: oc.route({ method: 'GET', path: '/admin/jobs/list' }).output(jobsListDto),
  history: oc.route({ method: 'GET', path: '/admin/jobs/history' }).input(jobHistoryInput).output(jobHistoryOutput),
}
