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

// `nextDailyMaintenanceDelayMs` runs for real: with no hydrated settings the
// timeZone defaults to UTC, and the fake timers make the 04:30 daily slot
// deterministic — advancing a full day + margin crosses exactly one fire.
const ADVANCE_TO_NEXT_RUN_MS = 86_400_000 + 1_000

const { scheduleNextTokenPurge, wireTokenPurgeScheduler } = await import('@/server/domains/auth/token-purge-scheduler')
const { stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')

describe('auth token-purge scheduler', () => {
  beforeEach(() => {
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

    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(purgeExpired).toHaveBeenCalledTimes(1)
    expect(purgeExpired).toHaveBeenCalledWith(freshDb)
  })

  it('reschedules the next run after the job completes', async () => {
    scheduleNextTokenPurge()
    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(purgeExpired).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(purgeExpired).toHaveBeenCalledTimes(2)
  })

  it('stops the scheduler', () => {
    scheduleNextTokenPurge()
    expect(vi.getTimerCount()).toBe(1)
    stopAllScheduledJobs()
    expect(vi.getTimerCount()).toBe(0)
  })
})
