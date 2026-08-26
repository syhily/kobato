import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const registerShutdownHook = vi.fn()

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

const {
  __resetJobRegistrationsForTests,
  jobDb,
  jobHandle,
  nudgeRegisteredJob,
  registerJob,
  scheduleRegisteredJob,
  setJobHandleGetter,
  startAllRegisteredJobs,
} = await import('@/server/infra/job-registry')
const { stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')

describe('job registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stopAllScheduledJobs()
    __resetJobRegistrationsForTests()
  })

  afterEach(() => {
    stopAllScheduledJobs()
    __resetJobRegistrationsForTests()
  })

  it('throws when a job evaluates before the handle getter is wired', () => {
    // A fresh import graph would be unwired; this file wired nothing yet.
    expect(() => jobHandle()).toThrow('background job evaluated before the database handle was wired')
    expect(() => jobDb()).toThrow('background job evaluated before the database handle was wired')
  })

  it('exposes the wired db lazily', () => {
    const dbA = {}
    const dbB = {}
    let current = { db: dbA }
    setJobHandleGetter({ getDatabaseHandle: () => current as never })

    expect(jobDb()).toBe(dbA)
    // Re-read on every call — a reopened handle is picked up.
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

    // Idempotent start: no duplicate timers.
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

    // …but reschedules once armed.
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

    // Unknown names are ignored — the owning module was never imported.
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
    // Replacement stops the old instance's pending fire…
    registerJob({ name: 'test.replaced', nextDelayMs: () => 1_000, run: runV2 })
    expect(vi.getTimerCount()).toBe(0)

    // …and the new policy takes over.
    startAllRegisteredJobs()
    vi.advanceTimersByTime(1_000)
    expect(runV1).not.toHaveBeenCalled()
    expect(runV2).toHaveBeenCalledTimes(1)
  })
})
