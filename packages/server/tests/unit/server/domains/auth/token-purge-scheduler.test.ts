import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const purgeExpired = vi.fn().mockResolvedValue(0)
const registerShutdownHook = vi.fn()
const db = {}

vi.mock('@kobato/server/domains/auth/verification-tokens.ts', () => ({
  purgeExpired: (...args: unknown[]) => purgeExpired(...args),
}))

vi.mock('@kobato/server/infra/lifecycle.ts', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

const PINNED_NOW = new Date('2026-01-15T12:00:00.000Z')

const { scheduleRegisteredJob, setJobHandleGetter } = await import('@kobato/server/infra/job-registry.ts')
const { nextDailyMaintenanceDelayMs, stopAllScheduledJobs } = await import('@kobato/server/infra/scheduler-utils.ts')
await import('@kobato/server/domains/auth/token-purge-scheduler.ts')

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
