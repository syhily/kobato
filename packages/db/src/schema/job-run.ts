import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Persistence-canonical `job_run` enums — the single source for the columns
// and the CHECK literals below. The wire twins (zod enums + history DTOs)
// live in `@kobato/contracts/jobs`; the lists stay value- and
// order-identical, pinned by
// `packages/server/tests/unit/server/infra/db/wire-parity.test.ts`.

/** `job_run.trigger` values. */
export const JOB_RUN_TRIGGERS = ['scheduled', 'manual'] as const
export type JobRunTrigger = (typeof JOB_RUN_TRIGGERS)[number]

/** `job_run.status` values. */
export const JOB_RUN_STATUSES = ['running', 'success', 'failed', 'cancelled'] as const
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number]

// Single source: the CHECK enums are generated from the constant arrays
// above (same pattern as schema/webmention.ts).
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
