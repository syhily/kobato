import type { Database } from '@kobato/db/sqlite/database'

import { JOB_RUN_ERROR_PROCESS_RESTART, type JobRunStatus, type JobRunTrigger } from '@kobato/api/contracts/jobs'
import {
  finishJobRun as finishJobRunOp,
  latestJobRunsByTask as latestJobRunsByTaskOp,
  listJobRuns as listJobRunsOp,
  pruneJobRuns as pruneJobRunsOp,
  startJobRun as startJobRunOp,
  sweepOrphanedJobRuns as sweepOrphanedJobRunsOp,
  type JobRunRow,
} from '@kobato/db/sqlite/operations/system/job-run'
import { getLogger } from '@kobato/server/infra/logger'

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

export function wireJobRunRecorder(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

export function sweepOrphanedJobRuns(db: Database): void {
  try {
    sweepOrphanedJobRunsOp(db, JOB_RUN_ERROR_PROCESS_RESTART)
  } catch (error) {
    log.warn('orphan job_run sweep failed', { err: error instanceof Error ? error.message : String(error) })
  }
}

export function startJobRun(taskKey: string, trigger: JobRunTrigger): number | null {
  if (resolveDb === null) {
    return null
  }
  try {
    return startJobRunOp(resolveDb(), taskKey, trigger)
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
    const truncatedError = error === undefined ? null : error.slice(0, ERROR_MAX_CHARS)
    const taskKey = finishJobRunOp(resolveDb(), runId, status, truncatedError)
    if (status === 'failed' && taskKey !== null) {
      maybeNotifyFailure(taskKey, truncatedError)
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
  return listJobRunsOp(resolveDb(), filter)
}

export function latestJobRunsByTask(): Map<string, JobRunRow> {
  if (resolveDb === null) {
    return new Map()
  }
  return latestJobRunsByTaskOp(resolveDb())
}

export function pruneJobRuns(db: Database, now: Date = new Date()): number {
  return pruneJobRunsOp(db, JOB_RUN_RETENTION_DAYS, JOB_RUN_KEEP_PER_TASK, now)
}

export type { JobRunRow }
export type { JobRunStatus }
