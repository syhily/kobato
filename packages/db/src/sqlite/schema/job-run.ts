import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const JOB_RUN_TRIGGERS = ['scheduled', 'manual'] as const
export type JobRunTrigger = (typeof JOB_RUN_TRIGGERS)[number]

export const JOB_RUN_STATUSES = ['running', 'success', 'failed', 'cancelled'] as const
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number]

const sqlEnumList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '))

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
