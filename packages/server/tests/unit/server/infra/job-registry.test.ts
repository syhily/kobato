import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  __resetJobHandleForTests,
  __resetJobRegistrationsForTests,
  jobDb,
  jobHandle,
  nudgeRegisteredJob,
  registerJob,
  scheduleRegisteredJob,
  setJobHandleGetter,
  startAllRegisteredJobs,
} = await import('@kobato/server/infra/job-registry.ts')
const { stopAllScheduledJobs } = await import('@kobato/server/infra/scheduler-utils.ts')

describe('job registry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    stopAllScheduledJobs()
    __resetJobRegistrationsForTests()
    __resetJobHandleForTests()
  })

  afterEach(() => {
    stopAllScheduledJobs()
    __resetJobRegistrationsForTests()
    vi.useRealTimers()
  })

  it('throws when a job evaluates before the handle getter is wired', () => {
    expect(() => jobHandle()).toThrow('background job evaluated before the database handle was wired')
    expect(() => jobDb()).toThrow('background job evaluated before the database handle was wired')
  })

  it('exposes the wired db lazily', () => {
    const dbA = {}
    const dbB = {}
    let current = { db: dbA }
    setJobHandleGetter({ getDatabaseHandle: () => current as never })

    expect(jobDb()).toBe(dbA)
    current = { db: dbB }
    expect(jobDb()).toBe(dbB)
  })

  it('arms every registered job exactly once per start', () => {
    const db = {}
    setJobHandleGetter({ getDatabaseHandle: () => ({ db }) as never })
    const run = vi.fn()
    registerJob({ name: 'test.job-a', nextDelayMs: () => 1_000, run })
    registerJob({ name: 'test.job-b', nextDelayMs: () => 2_000, run })

    startAllRegisteredJobs()
    expect(vi.getTimerCount()).toBe(2)

    startAllRegisteredJobs()
    expect(vi.getTimerCount()).toBe(2)

    vi.advanceTimersByTime(1_000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('nudge is a no-op before boot start — it never creates the job', () => {
    const db = {}
    setJobHandleGetter({ getDatabaseHandle: () => ({ db }) as never })
    registerJob({ name: 'test.nudged', nextDelayMs: () => 1_000, run: vi.fn() })

    nudgeRegisteredJob('test.nudged')
    expect(vi.getTimerCount()).toBe(0)

    scheduleRegisteredJob('test.nudged')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('scheduleRegisteredJob creates-or-reschedules a single registered job', () => {
    const db = {}
    setJobHandleGetter({ getDatabaseHandle: () => ({ db }) as never })
    const run = vi.fn()
    registerJob({ name: 'test.single', nextDelayMs: () => 5_000, run })

    scheduleRegisteredJob('test.single')
    expect(vi.getTimerCount()).toBe(1)

    expect(() => scheduleRegisteredJob('test.never-registered')).not.toThrow()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('re-registering a name replaces the entry HMR-safely', () => {
    const db = {}
    setJobHandleGetter({ getDatabaseHandle: () => ({ db }) as never })
    const runV1 = vi.fn()
    const runV2 = vi.fn()
    registerJob({ name: 'test.replaced', nextDelayMs: () => 10_000, run: runV1 })

    startAllRegisteredJobs()
    registerJob({ name: 'test.replaced', nextDelayMs: () => 1_000, run: runV2 })
    expect(vi.getTimerCount()).toBe(0)

    startAllRegisteredJobs()
    vi.advanceTimersByTime(1_000)
    expect(runV1).not.toHaveBeenCalled()
    expect(runV2).toHaveBeenCalledTimes(1)
  })
})
