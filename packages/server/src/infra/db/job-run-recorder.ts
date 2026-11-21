import type { Database } from '@kobato/db/database'

import { JOB_RUN_ERROR_PROCESS_RESTART, type JobRunStatus, type JobRunTrigger } from '@kobato/api/contracts/jobs'
import { jobRun } from '@kobato/db/schema/job-run'
import { getLogger } from '@kobato/server/infra/logger'
import { count, desc, eq, inArray, lt, sql } from 'drizzle-orm'

const log = getLogger('job-run-recorder')

const ERROR_MAX_CHARS = 500
export const JOB_RUN_RETENTION_DAYS = 30
export const JOB_RUN_KEEP_PER_TASK = 200
export const JOB_FAILURE_NOTIFY_DEDUPE_MS = 24 * 60 * 60 * 1000

let resolveDb: (() => Database) | null = null

export interface JobFailureNotice {
  taskKey: string
  error: string | null
}

let notifyFailure: ((info: JobFailureNotice) => void) | null = null
const lastFailureNoticeAt = new Map<string, number>()

export function wireJobFailureNotifier(cb: (info: JobFailureNotice) => void): void {
  notifyFailure = cb
}

export function resetJobFailureNotifier(): void {
  notifyFailure = null
  lastFailureNoticeAt.clear()
}

function maybeNotifyFailure(taskKey: string, error: string | null): void {
  if (notifyFailure === null) {
    return
  }
  const now = Date.now()
  const last = lastFailureNoticeAt.get(taskKey)
  if (last !== undefined && now - last < JOB_FAILURE_NOTIFY_DEDUPE_MS) {
    return
  }
  lastFailureNoticeAt.set(taskKey, now)
  try {
    notifyFailure({ taskKey, error })
  } catch (cause) {
    log.warn('job failure notifier threw', { taskKey, err: cause instanceof Error ? cause.message : String(cause) })
  }
}

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

export function wireJobRunRecorder(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

export function sweepOrphanedJobRuns(db: Database): void {
  try {
    db.update(jobRun)
      .set({ status: 'failed', finishedAt: new Date(), error: JOB_RUN_ERROR_PROCESS_RESTART })
      .where(eq(jobRun.status, 'running'))
      .run()
  } catch (error) {
    log.warn('orphan job_run sweep failed', { err: error instanceof Error ? error.message : String(error) })
  }
}

export function startJobRun(taskKey: string, trigger: JobRunTrigger): number | null {
  if (resolveDb === null) {
    return null
  }
  try {
    const result = resolveDb()
      .insert(jobRun)
      .values({ taskKey, trigger, status: 'running', startedAt: new Date() })
      .run()
    return Number(result.lastInsertRowid)
  } catch (error) {
    log.warn('startJobRun failed', { taskKey, err: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export function finishJobRun(runId: number | null, status: 'success' | 'failed' | 'cancelled', error?: string): void {
  if (resolveDb === null || runId === null) {
    return
  }
  try {
    const finishedAt = new Date()
    const truncatedError = error === undefined ? null : error.slice(0, ERROR_MAX_CHARS)
    const updated = resolveDb()
      .update(jobRun)
      .set({
        status,
        finishedAt,
        durationMs: sql<number>`${finishedAt.getTime()} - ${jobRun.startedAt}`,
        error: truncatedError,
      })
      .where(eq(jobRun.id, runId))
      .returning({ taskKey: jobRun.taskKey })
      .all()
    if (status === 'failed' && updated.length > 0) {
      maybeNotifyFailure(updated[0]!.taskKey, truncatedError)
    }
  } catch (cause) {
    log.warn('finishJobRun failed', { runId, err: cause instanceof Error ? cause.message : String(cause) })
  }
}

export function listJobRuns(filter: { taskKey: string; offset: number; limit: number }): {
  items: JobRunRow[]
  total: number
} {
  if (resolveDb === null) {
    return { items: [], total: 0 }
  }
  const db = resolveDb()
  const items = db
    .select()
    .from(jobRun)
    .where(eq(jobRun.taskKey, filter.taskKey))
    .orderBy(desc(jobRun.startedAt), desc(jobRun.id))
    .offset(filter.offset)
    .limit(filter.limit)
    .all()
  const total = db.select({ value: count() }).from(jobRun).where(eq(jobRun.taskKey, filter.taskKey)).get()?.value ?? 0
  return { items, total }
}

export function latestJobRunsByTask(): Map<string, JobRunRow> {
  const latest = new Map<string, JobRunRow>()
  if (resolveDb === null) {
    return latest
  }
  const db = resolveDb()
  const latestIds = db
    .select({ id: sql<number>`MAX(${jobRun.id})`.mapWith(Number).as('id') })
    .from(jobRun)
    .groupBy(jobRun.taskKey)
    .all()
    .map((row) => row.id)
  if (latestIds.length === 0) {
    return latest
  }
  const rows = db.select().from(jobRun).where(inArray(jobRun.id, latestIds)).all()
  for (const row of rows) {
    latest.set(row.taskKey, row)
  }
  return latest
}

export function pruneJobRuns(db: Database, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - JOB_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  return db.transaction((tx) => {
    const aged = tx.delete(jobRun).where(lt(jobRun.startedAt, cutoff)).run()
    const overflow = tx.run(sql`
      DELETE FROM job_run WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY task_key ORDER BY started_at DESC, id DESC) AS rn
          FROM job_run
        ) WHERE rn > ${JOB_RUN_KEEP_PER_TASK}
      )
    `)
    return Number(aged.changes) + Number(overflow.changes)
  })
}
