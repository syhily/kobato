import { adminJobsContract } from '@kobato/api/admin/jobs.ts'
import {
  TASK_CATALOG,
  type JobHistoryOutput,
  type JobRunDto,
  type JobSummaryDto,
  type JobsListDto,
} from '@kobato/contracts/jobs.ts'
import { getStorageMigrationStatus } from '@kobato/server/domains/storage/s3-migration.ts'
import { queueTaskStats } from '@kobato/server/domains/webmentions/queue-stats.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'
import { latestJobRunsByTask, listJobRuns, type JobRunRow } from '@kobato/server/infra/db/job-run-recorder.ts'
import { getSchedulerTaskState } from '@kobato/server/infra/scheduler-utils.ts'

const impl = implementAdmin(adminJobsContract)

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

const list = impl.list.handler(async ({ context }): Promise<JobsListDto> => {
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

const history = impl.history.handler(async ({ input }): Promise<JobHistoryOutput> => {
  const { items, total } = listJobRuns({ taskKey: input.taskKey, offset: input.offset, limit: input.limit })
  return { items: items.map(toJobRunDto), total, hasMore: input.offset + items.length < total }
})

export const adminJobsRouter = impl.router({ list, history })
