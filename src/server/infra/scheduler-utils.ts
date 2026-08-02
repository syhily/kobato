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
 * The one owner of the daily-maintenance wall-clock slot: 04:30 in the
 * site's configured timezone (the audit archive runs at 04:00). Both
 * engine maintenance jobs — SQLite (infra/db/maintenance) and DuckDB
 * (bootstrap/analytics-lifecycle) — compute their delay here so the
 * two halves of one conceptual job can never drift apart.
 */
export function nextDailyMaintenanceDelayMs(): number {
  const timeZone = getBlogSettingsBundleSync()?.siteIdentity?.timeZone ?? 'UTC'
  return computeNextRun({ frequency: 'daily', hour: 4, minute: 30 }, timeZone, new Date()).getTime() - Date.now()
}

// ─── Scheduled jobs ──────────────────────────────────────
// One self-rescheduling-timer seam for every periodic job (kv sweep,
// audit archive, backup, GeoIP update, and the two engine maintenance
// jobs). The
// domain owns its POLICY through two closures — when to fire next and
// what to do — while this module owns the MECHANICS: timer lifecycle,
// `.unref()`, self-reschedule after every fire, error logging, and one
// shutdown hook that stops every registered job. The db-handle getter
// each job closes over is about FRESHNESS (a reopened handle after
// restore must be picked up), never about import cycles.

export interface ScheduledJobOptions {
  /** Logger scope. */
  name: string
  /**
   * Milliseconds until the next fire, or `null` to suspend — the job
   * re-evaluates after `suspendedRetryMs` (settings not hydrated yet,
   * feature disabled, …). Computed fresh after every run and on every
   * `reschedule()`, so settings changes apply by rescheduling.
   */
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
 * Node clamps `setTimeout` delays ≥ 2³¹-1 ms (~24.85 days) to 1 ms — a
 * monthly backup scheduled ~31 days out would fire instantly, then
 * re-arm the same future date and fire again, back-to-back forever.
 * Delays beyond this cap are therefore CHUNKED: the timer only
 * reschedules (the job's `nextDelayMs()` is recomputed fresh each time)
 * without running, until the remaining delay fits under the cap.
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
      // Re-arming re-registers after a stop() — stop() is "clear the
      // pending fire", never a permanent kill (tests and settings
      // toggles rely on resurrection via the public schedule verbs).
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
        // Too far out for a single setTimeout — re-arm in chunks, never
        // running the job early (see MAX_TIMER_DELAY_MS).
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

/**
 * Stop every registered job. Used by the shutdown hook — and by tests
 * cleaning up between cases, which is why it exists as a public verb:
 * the per-domain `stop*Scheduler` wrappers that predated it were
 * deleted (the seam owns stopping).
 */
export function stopAllScheduledJobs(): void {
  // Backwards iteration: stop() deregisters the job from the array,
  // so forward iteration would skip entries.
  for (let i = registeredJobs.length - 1; i >= 0; i--) {
    registeredJobs[i]!.stop()
  }
}

registerShutdownHook(async () => {
  stopAllScheduledJobs()
}, 0)
