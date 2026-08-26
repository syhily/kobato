import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

vi.useFakeTimers()

const registerShutdownHook = vi.fn()

// Stub just enough of the Drizzle chain for `db.delete(table).where(…)`.
const where = vi.fn().mockResolvedValue(undefined)
const db = { delete: vi.fn(() => ({ where })) }

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

const { scheduleRegisteredJob, setJobHandleGetter } = await import('@/server/infra/job-registry')
const { sweepExpiredKvEntries } = await import('@/server/infra/cache/kv-maintenance')
const { stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

// The registry owns the shared db getter; a bare handle shape suffices —
// the job reads only `.db` at fire time.
let currentDb = db
setJobHandleGetter({ getDatabaseHandle: () => ({ db: currentDb }) as never })

describe('kv-maintenance scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearLogCaptureForTests()
    currentDb = db
    stopAllScheduledJobs()
  })

  afterEach(() => {
    stopAllScheduledJobs()
  })

  it('sweeps all three tables when the hourly timer fires', async () => {
    scheduleRegisteredJob('kv.maintenance')
    expect(vi.getTimerCount()).toBe(1)
    expect(db.delete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    // kv_cache + one_time_token + session.
    expect(db.delete).toHaveBeenCalledTimes(3)
  })

  it('resolves the db lazily at fire time, not at schedule time', async () => {
    scheduleRegisteredJob('kv.maintenance')

    // A recreated pool (restore completion) must be picked up.
    const freshDb = { delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }
    currentDb = freshDb

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(freshDb.delete).toHaveBeenCalledTimes(3)
    expect(db.delete).not.toHaveBeenCalled()
  })

  it('reschedules the next sweep after each run', async () => {
    scheduleRegisteredJob('kv.maintenance')
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(db.delete).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(db.delete).toHaveBeenCalledTimes(6)
  })

  it('logs the error and still reschedules when the sweep fails', async () => {
    where.mockRejectedValueOnce(new Error('sweep failed'))
    scheduleRegisteredJob('kv.maintenance')
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(__logCaptureForTests().some((e) => e.level === 'error')).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stops the scheduler', () => {
    scheduleRegisteredJob('kv.maintenance')
    expect(vi.getTimerCount()).toBe(1)
    stopAllScheduledJobs()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('sweepExpiredKvEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('issues one delete per replacement table', async () => {
    const localWhere = vi.fn().mockResolvedValue(undefined)
    const localDb = { delete: vi.fn(() => ({ where: localWhere })) }
    await sweepExpiredKvEntries(localDb as unknown as Database)
    expect(localDb.delete).toHaveBeenCalledTimes(3)
    expect(localWhere).toHaveBeenCalledTimes(3)
  })
})
