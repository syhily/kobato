import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { JOB_RUN_STATUSES, JOB_RUN_TRIGGERS, type JobRunStatus, type JobRunTrigger } from '@/shared/contracts/jobs'

// Single source: the CHECK enums are generated from the wire contract's
// constant arrays (same pattern as schema/webmention.ts).
const sqlEnumList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '))

// Background-job execution history — one row per run attempt (scheduled or
// manual). Written by the opt-in recorder (`infra/db/job-run-recorder`);
// `duration_ms` is derived at finish time, `error` is truncated to 500
// chars. Rows left `running` by a crash are swept to `failed` once at boot;
// rows are pruned to 30 days / 200 per task by the daily maintenance.
export const jobRun = sqliteTable(
  'job_run',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    taskKey: text('task_key').notNull(),
    trigger: text('trigger').$type<JobRunTrigger>().notNull(),
    status: text('status').$type<JobRunStatus>().notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    durationMs: integer('duration_ms'),
    error: text('error'),
  },
  (table) => [
    check('job_run_trigger_chk', sql`${table.trigger} IN (${sqlEnumList(JOB_RUN_TRIGGERS)})`),
    check('job_run_status_chk', sql`${table.status} IN (${sqlEnumList(JOB_RUN_STATUSES)})`),
    index('idx_job_run_task_started').on(table.taskKey, table.startedAt),
  ],
)
