import { TZDate } from '@date-fns/tz'
import { addDays, addMonths, isAfter } from 'date-fns'

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

export interface ScheduledJobOptions {
  /** Logger scope. */
  name: string
  /** Milliseconds until the next fire, or `null` to suspend (re-check after `suspendedRetryMs`); computed fresh on every reschedule. */
  nextDelayMs: () => number | null
  run: () => Promise<void> | void
  /** Re-check delay while suspended (default 30s). */
  suspendedRetryMs?: number
}

export interface ScheduledJob {
  /** Clear the pending fire and recompute (settings changed, boot). */
  reschedule(): void
  stop(): void
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
        timer = setTimeout(() => job.reschedule(), suspendedRetryMs)
      } else if (delayMs > MAX_TIMER_DELAY_MS) {
        // Too far out for one setTimeout — re-arm in chunks, never running early.
        timer = setTimeout(() => job.reschedule(), MAX_TIMER_DELAY_MS)
      } else {
        timer = setTimeout(() => {
          void (async () => {
            try {
              await options.run()
            } catch (error) {
              log.error('scheduled job run failed', { err: error instanceof Error ? error.message : String(error) })
            } finally {
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
