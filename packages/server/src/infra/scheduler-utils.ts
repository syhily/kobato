import { TZDate } from '@date-fns/tz'
import { finishJobRun, startJobRun } from '@kobato/server/infra/db/job-run-recorder'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { registerShutdownHook } from '@kobato/server/infra/lifecycle'
import { getLogger } from '@kobato/server/infra/logger'
import { isTraceActive, withSpanAsync } from '@kobato/server/infra/trace/facade'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { addDays, addMonths, isAfter } from 'date-fns'

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
      throw new DomainError('BAD_REQUEST', descriptorFor('backup.error.weeklyDayRequired'))
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

  if (typeof settings.dayOfMonth !== 'number' || settings.dayOfMonth < 1 || settings.dayOfMonth > 31) {
    throw new DomainError('BAD_REQUEST', descriptorFor('backup.error.monthlyDayRequired'))
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

export function nextDailyMaintenanceDelayMs(): number {
  const timeZone = getBlogSettingsBundleSync()?.siteIdentity?.timeZone ?? 'UTC'
  return computeNextRun({ frequency: 'daily', hour: 4, minute: 30 }, timeZone, new Date()).getTime() - Date.now()
}

export interface ScheduledJobTask {
  key: string
  recordHistory?: boolean
}

export interface ScheduledJobOptions {
  name: string
  /** Milliseconds until the next fire, or `null` to suspend (re-check after `suspendedRetryMs`); computed fresh on every reschedule. */
  nextDelayMs: () => number | null
  run: () => Promise<void> | void
  suspendedRetryMs?: number
  task?: ScheduledJobTask
}

export interface ScheduledJob {
  reschedule(): void
  stop(): void
}

export interface TaskLiveState {
  suspended: boolean
  nextRunAt: Date | null
  running: boolean
}

const taskStates = new Map<string, TaskLiveState>()

export function getSchedulerTaskState(taskKey: string): TaskLiveState | null {
  const state = taskStates.get(taskKey)
  return state === undefined ? null : { ...state }
}

export function __resetSchedulerTaskStatesForTests(): void {
  taskStates.clear()
}

interface TaskTracker {
  suspended(): void
  armed(delayMs: number): void
  started(): void
  finished(): void
}

function noop(): void {
  return undefined
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

export const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000

export function scheduleJob(options: ScheduledJobOptions): ScheduledJob {
  const log = getLogger(options.name)
  const suspendedRetryMs = options.suspendedRetryMs ?? 30_000
  let timer: NodeJS.Timeout | null = null

  const track = options.task === undefined ? noopTracker : createTaskTracker(options.task.key)
  const run = options.task?.recordHistory === true ? wrapWithHistory(options.task.key, options.run) : options.run
  const traceAttributes =
    options.task === undefined
      ? { 'job.name': options.name }
      : { 'job.name': options.name, 'job.task_key': options.task.key }
  const execute = (): Promise<void> | void =>
    isTraceActive()
      ? withSpanAsync('job.run', { attributes: traceAttributes }, async (span) => {
          await run()
          span.setStatus('ok')
        })
      : run()

  const job: ScheduledJob = {
    reschedule() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
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
        track.suspended()
        timer = setTimeout(() => job.reschedule(), suspendedRetryMs)
      } else if (delayMs > MAX_TIMER_DELAY_MS) {
        timer = setTimeout(() => job.reschedule(), MAX_TIMER_DELAY_MS)
      } else {
        track.armed(delayMs)
        timer = setTimeout(() => {
          void (async () => {
            track.started()
            try {
              await execute()
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

export function stopAllScheduledJobs(): void {
  for (let i = registeredJobs.length - 1; i >= 0; i--) {
    registeredJobs[i]!.stop()
  }
}

registerShutdownHook(async () => {
  stopAllScheduledJobs()
}, 0)
