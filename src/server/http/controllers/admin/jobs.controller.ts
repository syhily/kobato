import { getStorageMigrationStatus } from '@/server/domains/storage/s3-migration'
import { queueTaskStats } from '@/server/domains/webmentions/queue-stats'
import { adminProc } from '@/server/http/orpc-base'
import { latestJobRunsByTask, listJobRuns, type JobRunRow } from '@/server/infra/db/job-run-recorder'
import { getSchedulerTaskState } from '@/server/infra/scheduler-utils'
import {
  TASK_CATALOG,
  jobHistoryInput,
  jobHistoryOutput,
  jobsListDto,
  type JobHistoryOutput,
  type JobRunDto,
  type JobSummaryDto,
  type JobsListDto,
} from '@/shared/contracts/jobs'

// Admin task center — read-only aggregation over the task catalog, the
// scheduler's live states, the job_run history, and the webmention queue
// tables. No audit events (read-only queries MUST NOT record them).

function toJobRunDto(row: JobRunRow): JobRunDto {
  return {
    id: row.id,
    taskKey: row.taskKey,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    error: row.error,
  }
}

const list = adminProc
  .route({ method: 'GET', path: '/admin/jobs/list' })
  .output(jobsListDto)
  .handler(async ({ context }): Promise<JobsListDto> => {
    const latestRuns = latestJobRunsByTask()
    const tasks: JobSummaryDto[] = []
    for (const task of TASK_CATALOG) {
      const live = getSchedulerTaskState(task.key)
      const lastRun = latestRuns.get(task.key)
      tasks.push({
        taskKey: task.key,
        label: task.label,
        description: task.description,
        kind: task.kind,
        group: task.group,
        scheduleHint: task.scheduleHint,
        liveState:
          live === null
            ? null
            : { suspended: live.suspended, nextRunAt: live.nextRunAt?.toISOString() ?? null, running: live.running },
        lastRun: lastRun === undefined ? null : toJobRunDto(lastRun),
        queue: await queueTaskStats(context.db, task.key),
      })
    }
    return { tasks, storageMigration: await getStorageMigrationStatus(context.db) }
  })

const history = adminProc
  .route({ method: 'GET', path: '/admin/jobs/history' })
  .input(jobHistoryInput)
  .output(jobHistoryOutput)
  .handler(async ({ input }): Promise<JobHistoryOutput> => {
    const { items, total } = listJobRuns({ taskKey: input.taskKey, offset: input.offset, limit: input.limit })
    return { items: items.map(toJobRunDto), total, hasMore: input.offset + items.length < total }
  })

export const adminJobsRouter = { list, history }
