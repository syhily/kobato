import { count, desc, eq, inArray, lt, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { JobRunStatus, JobRunTrigger } from '@/shared/contracts/jobs'

import { jobRun } from '@/server/infra/db/schema/job-run'
import { getLogger } from '@/server/infra/logger'

// Opt-in execution-history recorder for background jobs. The composition
// root wires the db getter (`wireJobRunRecorder`); before that every
// getter-resolved function is a silent no-op (the VITEST env-only boot must
// stay free of side effects). Writes NEVER throw — history must not be able
// to kill the job it records. The boot-time orphan sweep
// (`sweepOrphanedJobRuns`) takes its db explicitly.

const log = getLogger('job-run-recorder')

/** Error messages are persisted truncated to this length. */
const ERROR_MAX_CHARS = 500
/** Retention: rows older than this are pruned by the daily maintenance. */
export const JOB_RUN_RETENTION_DAYS = 30
/** Retention: at most this many newest rows per task are kept. */
export const JOB_RUN_KEEP_PER_TASK = 200

let resolveDb: (() => Database) | null = null

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

/**
 * Wire the db getter (composition root, restore rewiring). Pure setter —
 * the crash-recovery sweep is a separate boot-time-only call
 * ({@link sweepOrphanedJobRuns}).
 */
export function wireJobRunRecorder(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

/**
 * Crash recovery: rows still `running` at boot belong to a dead process —
 * mark them failed so the UI never shows a phantom "运行中" forever. Called
 * ONCE by the composition root after the first wiring. The restore rewiring
 * must NOT re-run it: this process's in-flight jobs hold legit `running`
 * rows and would be mislabeled. Never throws.
 */
export function sweepOrphanedJobRuns(db: Database): void {
  try {
    db.update(jobRun)
      .set({ status: 'failed', finishedAt: new Date(), error: '进程重启中断' })
      .where(eq(jobRun.status, 'running'))
      .run()
  } catch (error) {
    log.warn('orphan job_run sweep failed', { err: error instanceof Error ? error.message : String(error) })
  }
}

/** Open a `running` row; returns its id, or null when unwired/failed. */
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

/** Close a run row with a terminal status; null id / unwired → no-op. */
export function finishJobRun(runId: number | null, status: 'success' | 'failed' | 'cancelled', error?: string): void {
  if (resolveDb === null || runId === null) {
    return
  }
  try {
    // One atomic UPDATE: `duration_ms` derives from the stored `started_at`
    // in-SQL (epoch-ms column), so an unknown id is a natural 0-changes no-op.
    const finishedAt = new Date()
    resolveDb()
      .update(jobRun)
      .set({
        status,
        finishedAt,
        durationMs: sql<number>`${finishedAt.getTime()} - ${jobRun.startedAt}`,
        error: error === undefined ? null : error.slice(0, ERROR_MAX_CHARS),
      })
      .where(eq(jobRun.id, runId))
      .run()
  } catch (cause) {
    log.warn('finishJobRun failed', { runId, err: cause instanceof Error ? cause.message : String(cause) })
  }
}

/** Newest-first history page for one task. */
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

/** The newest row per task key (for the list aggregation). */
export function latestJobRunsByTask(): Map<string, JobRunRow> {
  const latest = new Map<string, JobRunRow>()
  if (resolveDb === null) {
    return latest
  }
  const db = resolveDb()
  const latestIds = db
    .select({ id: sql<number>`MAX(${jobRun.id})`.as('id') })
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

/**
 * Retention prune (daily maintenance): drop rows older than
 * {@link JOB_RUN_RETENTION_DAYS}, then keep only the newest
 * {@link JOB_RUN_KEEP_PER_TASK} per task. Runs in one sync transaction;
 * returns the deleted row count. Throws on failure (the caller logs).
 *
 * Takes the db explicitly — unlike the wired getter the rest of this module
 * uses — because the only caller (`runDbMaintenance`) already holds the
 * current handle.
 */
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
