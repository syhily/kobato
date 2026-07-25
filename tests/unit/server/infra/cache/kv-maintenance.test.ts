import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const registerShutdownHook = vi.fn()

// Stub just enough of the Drizzle chain for `db.delete(table).where(…)`.
const where = vi.fn().mockResolvedValue(undefined)
const db = { delete: vi.fn(() => ({ where })) }
const getDb = vi.fn().mockReturnValue(db)

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => logger),
}))

const { scheduleNextKvSweep, stopKvSweepScheduler, sweepExpiredKvEntries, wireKvSweepScheduler } =
  await import('@/server/infra/cache/kv-maintenance')

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

describe('kv-maintenance scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDb.mockReturnValue(db)
    stopKvSweepScheduler()
    wireKvSweepScheduler({ getDb })
  })

  afterEach(() => {
    stopKvSweepScheduler()
  })

  it('sweeps all three tables when the hourly timer fires', async () => {
    scheduleNextKvSweep()
    expect(vi.getTimerCount()).toBe(1)
    expect(db.delete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    // kv_cache + one_time_token + session.
    expect(db.delete).toHaveBeenCalledTimes(3)
  })

  it('resolves the db lazily at fire time, not at schedule time', async () => {
    scheduleNextKvSweep()

    // A recreated pool (restore completion) must be picked up.
    const freshDb = { delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }
    getDb.mockReturnValue(freshDb)

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(freshDb.delete).toHaveBeenCalledTimes(3)
    expect(db.delete).not.toHaveBeenCalled()
  })

  it('reschedules the next sweep after each run', async () => {
    scheduleNextKvSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(db.delete).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(db.delete).toHaveBeenCalledTimes(6)
  })

  it('logs the error and still reschedules when the sweep fails', async () => {
    where.mockRejectedValueOnce(new Error('sweep failed'))
    scheduleNextKvSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(logger.error).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stops the scheduler', () => {
    scheduleNextKvSweep()
    expect(vi.getTimerCount()).toBe(1)
    stopKvSweepScheduler()
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
    await sweepExpiredKvEntries(localDb as unknown as NodePgDatabase)
    expect(localDb.delete).toHaveBeenCalledTimes(3)
    expect(localWhere).toHaveBeenCalledTimes(3)
  })
})
