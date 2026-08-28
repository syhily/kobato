import { TZDate } from '@date-fns/tz'
import { addDays, addMonths, isAfter } from 'date-fns'

import { finishJobRun, startJobRun } from '@/server/infra/db/job-run-recorder'
import { DomainError } from '@/server/infra/http/errors'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export function computeNextRun(
  settings: {
    frequency: 'daily' | 'weekly' | 'monthly'
    hour: number
    minute: number
    dayOfWeek?: number
    dayOfMonth?: number
  },
  timeZone: string,
  now: Date,
): Date {
  const tzNow = new TZDate(now, timeZone)

  if (settings.frequency === 'daily') {
    let candidate = new TZDate(
      tzNow.getFullYear(),
      tzNow.getMonth(),
      tzNow.getDate(),
      settings.hour,
      settings.minute,
      0,
      0,
      timeZone,
    )
    if (!isAfter(candidate, tzNow)) {
      candidate = addDays(candidate, 1)
    }
    return candidate
  }

  if (settings.frequency === 'weekly') {
    if (typeof settings.dayOfWeek !== 'number' || settings.dayOfWeek < 1 || settings.dayOfWeek > 7) {
      throw new DomainError('BAD_REQUEST', '每周备份必须指定 1–7 的星期几。')
    }
    const jsDay = settings.dayOfWeek === 7 ? 0 : settings.dayOfWeek
    let candidate = new TZDate(
      tzNow.getFullYear(),
      tzNow.getMonth(),
      tzNow.getDate(),
      settings.hour,
      settings.minute,
      0,
      0,
      timeZone,
    )
    const currentJsDay = candidate.getDay()
    let daysUntil = (jsDay - currentJsDay + 7) % 7
    if (daysUntil === 0 && !isAfter(candidate, tzNow)) {
      daysUntil = 7
    }
    candidate = addDays(candidate, daysUntil)
    return candidate
  }

  // monthly
  if (typeof settings.dayOfMonth !== 'number' || settings.dayOfMonth < 1 || settings.dayOfMonth > 31) {
    throw new DomainError('BAD_REQUEST', '每月备份必须指定 1–31 的日期。')
  }
  let candidate = new TZDate(
    tzNow.getFullYear(),
    tzNow.getMonth(),
    settings.dayOfMonth,
    settings.hour,
    settings.minute,
    0,
    0,
    timeZone,
  )
  if (!isAfter(candidate, tzNow)) {
    candidate = addMonths(candidate, 1)
  }
  return candidate
}

/**
 * Single owner of the daily-maintenance slot (04:30 site timezone); both
 * engine maintenance jobs compute their delay here so they can't drift.
 */
export function nextDailyMaintenanceDelayMs(): number {
  const timeZone = getBlogSettingsBundleSync()?.siteIdentity?.timeZone ?? 'UTC'
  return computeNextRun({ frequency: 'daily', hour: 4, minute: 30 }, timeZone, new Date()).getTime() - Date.now()
}

// One self-rescheduling-timer seam per periodic job: the domain owns
// policy (next-fire/run closures), this module owns the mechanics. Jobs
// close over the db-handle GETTER so a reopened handle is picked up.

/** Catalog task binding — opt-in live-state tracking plus optional history. */
export interface ScheduledJobTask {
  /** Catalog task key (`shared/contracts/jobs`). */
  key: string
  /** Persist each fire to `job_run` via the recorder. */
  recordHistory?: boolean
}

export interface ScheduledJobOptions {
  /** Logger scope. */
  name: string
  /** Milliseconds until the next fire, or `null` to suspend (re-check after `suspendedRetryMs`); computed fresh on every reschedule. */
  nextDelayMs: () => number | null
  run: () => Promise<void> | void
  /** Re-check delay while suspended (default 30s). */
  suspendedRetryMs?: number
  /** Bind a catalog task: live-state tracking, plus `job_run` history when `recordHistory` is set. */
  task?: ScheduledJobTask
}

export interface ScheduledJob {
  /** Clear the pending fire and recompute (settings changed, boot). */
  reschedule(): void
  stop(): void
}

/** Read-only live state for a tracked task (admin task center). */
export interface TaskLiveState {
  suspended: boolean
  nextRunAt: Date | null
  running: boolean
}

const taskStates = new Map<string, TaskLiveState>()

/** Snapshot of a tracked task's live state; null when the key never ran through `scheduleJob`. */
export function getSchedulerTaskState(taskKey: string): TaskLiveState | null {
  const state = taskStates.get(taskKey)
  return state === undefined ? null : { ...state }
}

/** Test seam: drop all tracked live states (unit-test isolation). */
export function __resetSchedulerTaskStatesForTests(): void {
  taskStates.clear()
}

/**
 * Live-state mutation surface for one scheduled job. `reschedule()` calls
 * these unconditionally — an untracked job binds the shared noop below.
 */
interface TaskTracker {
  suspended(): void
  armed(delayMs: number): void
  started(): void
  finished(): void
}

function noop(): void {
  // Intentionally empty — the untracked-job tracker.
}

const noopTracker: TaskTracker = { suspended: noop, armed: noop, started: noop, finished: noop }

function createTaskTracker(taskKey: string): TaskTracker {
  const state = taskStates.get(taskKey) ?? {
    suspended: false,
    nextRunAt: null,
    running: false,
  }
  taskStates.set(taskKey, state)
  return {
    suspended() {
      state.suspended = true
      state.nextRunAt = null
    },
    armed(delayMs: number) {
      state.suspended = false
      state.nextRunAt = new Date(Date.now() + delayMs)
    },
    started() {
      state.running = true
    },
    finished() {
      state.running = false
    },
  }
}

/**
 * History recording wraps the run closure ONCE at schedule time: open a
 * `job_run` row, finish it on success/failure, then rethrow so the outer
 * error log fires unchanged. A null id (recorder unwired) is a no-op finish.
 */
function wrapWithHistory(taskKey: string, run: () => Promise<void> | void): () => Promise<void> {
  return async () => {
    const runId = startJobRun(taskKey, 'scheduled')
    try {
      await run()
      finishJobRun(runId, 'success')
    } catch (error) {
      finishJobRun(runId, 'failed', error instanceof Error ? error.message : String(error))
      throw error
    }
  }
}

const registeredJobs: ScheduledJob[] = []

/**
 * Chunked timer delay cap: Node clamps delays ≥ 2³¹-1 ms to 1 ms, so longer
 * delays re-arm without running until the remainder fits.
 */
export const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000

export function scheduleJob(options: ScheduledJobOptions): ScheduledJob {
  const log = getLogger(options.name)
  const suspendedRetryMs = options.suspendedRetryMs ?? 30_000
  let timer: NodeJS.Timeout | null = null

  // Bound once here: the timer callback and reschedule branches stay free of
  // instrumentation conditionals.
  const track = options.task === undefined ? noopTracker : createTaskTracker(options.task.key)
  const run = options.task?.recordHistory === true ? wrapWithHistory(options.task.key, options.run) : options.run

  const job: ScheduledJob = {
    reschedule() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      // Re-arming re-registers the job — stop() only clears the pending fire.
      if (!registeredJobs.includes(job)) {
        registeredJobs.push(job)
      }
      let delayMs: number | null
      try {
        delayMs = options.nextDelayMs()
      } catch (error) {
        log.error('scheduled job failed to compute its next run', {
          err: error instanceof Error ? error.message : String(error),
        })
        delayMs = suspendedRetryMs
      }
      if (delayMs === null) {
        // Suspended: re-evaluate later WITHOUT running the job.
        track.suspended()
        timer = setTimeout(() => job.reschedule(), suspendedRetryMs)
      } else if (delayMs > MAX_TIMER_DELAY_MS) {
        // Too far out for one setTimeout — re-arm in chunks, never running
        // early. A chunk boundary is neither suspended nor due: keep the
        // last meaningful live state.
        timer = setTimeout(() => job.reschedule(), MAX_TIMER_DELAY_MS)
      } else {
        track.armed(delayMs)
        timer = setTimeout(() => {
          void (async () => {
            track.started()
            try {
              await run()
            } catch (error) {
              log.error('scheduled job run failed', { err: error instanceof Error ? error.message : String(error) })
            } finally {
              track.finished()
              job.reschedule()
            }
          })()
        }, delayMs)
      }
      timer.unref()
    },
    stop() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      const index = registeredJobs.indexOf(job)
      if (index !== -1) {
        registeredJobs.splice(index, 1)
      }
    },
  }

  registeredJobs.push(job)
  job.reschedule()
  return job
}

/** Stop every registered job (shutdown hook and test cleanup). */
export function stopAllScheduledJobs(): void {
  // Backwards: stop() deregisters from the array mid-iteration.
  for (let i = registeredJobs.length - 1; i >= 0; i--) {
    registeredJobs[i]!.stop()
  }
}

registerShutdownHook(async () => {
  stopAllScheduledJobs()
}, 0)
