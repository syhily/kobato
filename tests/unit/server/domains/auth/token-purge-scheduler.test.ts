import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const purgeExpired = vi.fn().mockResolvedValue(0)
const registerShutdownHook = vi.fn()
const db = {}

vi.mock('@/server/domains/auth/verification-tokens', () => ({
  purgeExpired: (...args: unknown[]) => purgeExpired(...args),
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

// `nextDailyMaintenanceDelayMs` runs for real. Pinning the fake clock to a
// fixed instant keeps the delay-to-fire identical on every machine and run,
// and advancing exactly that delay (+ 1 ms) crosses exactly one fire — a
// full-day blind advance is wall-clock dependent (a run starting within 1 s
// of the 04:30 slot double-fires) and sweeps a whole day of fake time.
const PINNED_NOW = new Date('2026-01-15T12:00:00.000Z')

const { scheduleRegisteredJob, setJobHandleGetter } = await import('@/server/infra/job-registry')
const { nextDailyMaintenanceDelayMs, stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')
// Load-bearing: the scheduler module self-registers on the job registry at import time.
await import('@/server/domains/auth/token-purge-scheduler')

// The registry owns the shared db getter; a bare handle shape suffices —
// the job reads only `.db` at fire time.
let currentDb = db
setJobHandleGetter({ getDatabaseHandle: () => ({ db: currentDb }) as never })

const advanceToNextRun = () => vi.advanceTimersByTimeAsync(nextDailyMaintenanceDelayMs() + 1)

describe('auth token-purge scheduler', () => {
  beforeEach(() => {
    vi.setSystemTime(PINNED_NOW)
    vi.clearAllMocks()
    currentDb = db
    stopAllScheduledJobs()
  })

  afterEach(() => {
    stopAllScheduledJobs()
  })

  it('runs purgeExpired with the lazily-resolved db when the timer fires', async () => {
    scheduleRegisteredJob('auth.token-purge')
    expect(purgeExpired).not.toHaveBeenCalled()

    // The db is read at fire time, not captured at schedule time — a
    // reopened handle (restore completion) is picked up.
    const freshDb = {}
    currentDb = freshDb

    await advanceToNextRun()
    expect(purgeExpired).toHaveBeenCalledTimes(1)
    expect(purgeExpired).toHaveBeenCalledWith(freshDb)
  })

  it('reschedules the next run after the job completes', async () => {
    scheduleRegisteredJob('auth.token-purge')
    await advanceToNextRun()
    expect(purgeExpired).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await advanceToNextRun()
    expect(purgeExpired).toHaveBeenCalledTimes(2)
  })

  it('stops the scheduler', () => {
    scheduleRegisteredJob('auth.token-purge')
    expect(vi.getTimerCount()).toBe(1)
    stopAllScheduledJobs()
    expect(vi.getTimerCount()).toBe(0)
  })
})
