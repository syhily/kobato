import type { Database } from '@kobato/db/sqlite/database'
import type { JobRunStatus, JobRunTrigger } from '@kobato/db/sqlite/schema/job-run'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { jobRun } from '@kobato/db/sqlite/schema/job-run'
import { count, desc, eq, inArray, lt, sql } from 'drizzle-orm'

export interface JobRunRow {
  id: number
  taskKey: string
  trigger: JobRunTrigger
  status: JobRunStatus
  startedAt: Date
  finishedAt: Date | null
  durationMs: number | null
  error: string | null
}

export function sweepOrphanedJobRuns(db: Database, error: string): void {
  sqliteOf(db)
    .update(jobRun)
    .set({ status: 'failed', finishedAt: new Date(), error })
    .where(eq(jobRun.status, 'running'))
    .run()
}

export function startJobRun(db: Database, taskKey: string, trigger: JobRunTrigger): number {
  const result = sqliteOf(db)
    .insert(jobRun)
    .values({ taskKey, trigger, status: 'running', startedAt: new Date() })
    .run()
  return Number(result.lastInsertRowid)
}

export function finishJobRun(
  db: Database,
  runId: number,
  status: 'success' | 'failed' | 'cancelled',
  error: string | null,
): string | null {
  const finishedAt = new Date()
  const updated = sqliteOf(db)
    .update(jobRun)
    .set({
      status,
      finishedAt,
      durationMs: sql<number>`${finishedAt.getTime()} - ${jobRun.startedAt}`,
      error,
    })
    .where(eq(jobRun.id, runId))
    .returning({ taskKey: jobRun.taskKey })
    .all()
  return updated[0]?.taskKey ?? null
}

export function listJobRuns(
  db: Database,
  filter: { taskKey: string; offset: number; limit: number },
): { items: JobRunRow[]; total: number } {
  const sdb = sqliteOf(db)
  const items = sdb
    .select()
    .from(jobRun)
    .where(eq(jobRun.taskKey, filter.taskKey))
    .orderBy(desc(jobRun.startedAt), desc(jobRun.id))
    .offset(filter.offset)
    .limit(filter.limit)
    .all()
  const total = sdb.select({ value: count() }).from(jobRun).where(eq(jobRun.taskKey, filter.taskKey)).get()?.value ?? 0
  return { items, total }
}

export function latestJobRunsByTask(db: Database): Map<string, JobRunRow> {
  const latest = new Map<string, JobRunRow>()
  const sdb = sqliteOf(db)
  const latestIds = sdb
    .select({ id: sql<number>`MAX(${jobRun.id})`.mapWith(Number).as('id') })
    .from(jobRun)
    .groupBy(jobRun.taskKey)
    .all()
    .map((row) => row.id)
  if (latestIds.length === 0) {
    return latest
  }
  const rows = sdb.select().from(jobRun).where(inArray(jobRun.id, latestIds)).all()
  for (const row of rows) {
    latest.set(row.taskKey, row)
  }
  return latest
}

export function pruneJobRuns(db: Database, retentionDays: number, keepPerTask: number, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  return sqliteOf(db).transaction((tx) => {
    const aged = tx.delete(jobRun).where(lt(jobRun.startedAt, cutoff)).run()
    const overflow = tx.run(sql`
      DELETE FROM job_run WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY task_key ORDER BY started_at DESC, id DESC) AS rn
          FROM job_run
        ) WHERE rn > ${keepPerTask}
      )
    `)
    return Number(aged.changes) + Number(overflow.changes)
  })
}
