import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const purgeExpired = vi.fn().mockResolvedValue(0)
const registerShutdownHook = vi.fn()
const db = {}
const getDb = vi.fn().mockReturnValue(db)

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

const { scheduleNextTokenPurge, wireTokenPurgeScheduler } = await import('@/server/domains/auth/token-purge-scheduler')
const { nextDailyMaintenanceDelayMs, stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')

const advanceToNextRun = () => vi.advanceTimersByTimeAsync(nextDailyMaintenanceDelayMs() + 1)

describe('auth token-purge scheduler', () => {
  beforeEach(() => {
    vi.setSystemTime(PINNED_NOW)
    vi.clearAllMocks()
    getDb.mockReturnValue(db)
    stopAllScheduledJobs()
    wireTokenPurgeScheduler({ getDb })
  })

  afterEach(() => {
    stopAllScheduledJobs()
  })

  it('runs purgeExpired with the lazily-resolved db when the timer fires', async () => {
    scheduleNextTokenPurge()
    expect(purgeExpired).not.toHaveBeenCalled()

    // The db is read via getDb() at fire time, not captured at schedule
    // time — a reopened handle (restore completion) is picked up.
    const freshDb = {}
    getDb.mockReturnValue(freshDb)

    await advanceToNextRun()
    expect(purgeExpired).toHaveBeenCalledTimes(1)
    expect(purgeExpired).toHaveBeenCalledWith(freshDb)
  })

  it('reschedules the next run after the job completes', async () => {
    scheduleNextTokenPurge()
    await advanceToNextRun()
    expect(purgeExpired).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await advanceToNextRun()
    expect(purgeExpired).toHaveBeenCalledTimes(2)
  })

  it('stops the scheduler', () => {
    scheduleNextTokenPurge()
    expect(vi.getTimerCount()).toBe(1)
    stopAllScheduledJobs()
    expect(vi.getTimerCount()).toBe(0)
  })
})
